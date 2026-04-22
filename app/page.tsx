"use client";



import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import Link from "next/link";

import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";

import { Briefcase, Zap, Shield, BarChart3, Globe, Layers, CheckCircle2, Users, Cpu, FileCheck, ArrowRight, Play, Star, MessageSquare, Calendar, Bot, TrendingUp, Award, Rocket, Sparkles, ChevronRight, Mail, Phone, MapPin, Building2 } from "lucide-react";



export default function Home() {

    const router = useRouter();

    const [loading, setLoading] = useState(true);

    const [session, setSession] = useState<any>(null);



    useEffect(() => {

        const checkAuth = async () => {

            try {

                const res = await fetch("/api/auth/me");

                if (res.ok) {

                    const data = await res.json();

                    setSession(data);

                }

            } catch (err) {

                console.error("Auth check failed", err);

            } finally {

                setLoading(false);

            }

        };

        checkAuth();

    }, []);



    const stats = [

        { value: "50K+", label: "Candidates Screened", icon: Users },

        { value: "500+", label: "Companies Trust Us", icon: Building2 },

        { value: "98%", label: "Client Satisfaction", icon: Star },

        { value: "10x", label: "Faster Hiring", icon: Zap },

    ];



    const features = [

        {

            icon: Bot,

            title: "AI Resume Screening",

            description: "Automatically parse and score resumes against job requirements using advanced NLP. Save 80% of screening time.",

            color: "from-orange-500 to-red-500"

        },

        {

            icon: MessageSquare,

            title: "Voice AI Interviews",

            description: "Conduct autonomous voice interviews with AI agents. Evaluate communication skills, technical knowledge, and problem-solving.",

            color: "from-blue-500 to-cyan-500"

        },

        {

            icon: Shield,

            title: "Advanced Proctoring",

            description: "AI-powered proctoring with face detection, screen monitoring, and anomaly detection to ensure interview integrity.",

            color: "from-green-500 to-emerald-500"

        },

        {

            icon: Calendar,

            title: "Smart Scheduling",

            description: "Automated interview scheduling with calendar integration. Candidates book slots that work for everyone.",

            color: "from-pink-500 to-rose-500"

        },

        {

            icon: TrendingUp,

            title: "Pipeline Automation",

            description: "Workflow automation that moves candidates through stages automatically based on score thresholds and actions.",

            color: "from-amber-500 to-yellow-500"

        },

    ];



    const steps = [

        {

            step: "01",

            title: "Create Your Drive",

            description: "Post jobs in minutes with AI-optimized job descriptions. Add requirements, skills, and evaluation criteria.",

        },

        {

            step: "02",

            title: "AI Does the Heavy Lifting",

            description: "Our AI screens every resume, conducts initial voice interviews, and shortlists the top candidates automatically.",

        },

        {

            step: "03",

            title: "Review & Decide",

            description: "Browse AI-scored candidates, watch interview recordings, and make informed hiring decisions in hours, not weeks.",

        },

    ];



    const testimonials = [

        {

            quote: "Sreeva AI transformed our hiring. We reduced time-to-hire by 70% and found candidates we would've never discovered through traditional methods.",

            author: "Sarah Chen",

            role: "VP of Engineering",

            company: "TechFlow Inc",

            avatar: "SC",

            rating: 5

        },

        {

            quote: "The voice AI interview feature is incredible. It helped us assess communication skills objectively without the scheduling headaches.",

            author: "Marcus Johnson",

            role: "HR Director",

            company: "GlobalTech Solutions",

            avatar: "MJ",

            rating: 5

        },

        {

            quote: "We've hired 12 senior developers through Sreeva AI. The quality of candidates and platform efficiency is unmatched.",

            author: "Elena Rodriguez",

            role: "CTO",

            company: "InnovateLab",

            avatar: "ER",

            rating: 5

        },

    ];



    const pricing = [

        {

            name: "Starter",

            price: "Free",

            period: "forever",

            description: "Perfect for small teams getting started",

            features: ["Up to 3 job drives", "50 AI screenings/month", "Email support"],

            cta: "Start Free",

            popular: false

        },

        {

            name: "Professional",

            price: "$49",

            period: "/month",

            description: "For growing teams ready to scale",

            features: ["Unlimited job drives", "500 AI screenings/month", "Voice AI interviews", "Priority support", "Custom workflows"],

            cta: "Start Trial",

            popular: true

        },

        {

            name: "Enterprise",

            price: "Custom",

            period: "",

            description: "For large organizations with complex needs",

            features: ["Everything in Pro", "Unlimited AI screenings", "Dedicated account manager", "SLA guarantee", "On-premise deployment"],

            cta: "Contact Sales",

            popular: false

        },

    ];



    return (

        <div className="min-h-screen bg-[#FDFCFB] selection:bg-orange-100 selection:text-orange-900 font-medium overflow-x-hidden" suppressHydrationWarning>

            {/* Global Header */}

            <header className="fixed top-0 z-50 w-full border-b border-gray-100/50 bg-white/90 backdrop-blur-2xl">

                <div className="max-w-7xl mx-auto h-20 px-6 flex items-center justify-between">

                    <Link href="/" className="flex items-center gap-3 group">

                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform">

                            <Briefcase className="h-5 w-5 text-white" />

                        </div>

                        <div className="flex flex-col">

                            <span className="text-xl font-black text-gray-900 leading-none tracking-tight">Sreeva<span className="text-[#F97316]"> AI</span></span>

                            <span className="text-[8px] text-gray-400 font-black uppercase tracking-[0.2em]">Intelligence Recruitment</span>

                        </div>

                    </Link>



                    <nav className="hidden lg:flex items-center gap-8">

                        <motion.a href="#features" className="text-[11px] font-black uppercase tracking-widest text-gray-500" whileHover={{ color: "#F97316" }} transition={{ duration: 0.2 }}>Features</motion.a>

                        <motion.a href="#how-it-works" className="text-[11px] font-black uppercase tracking-widest text-gray-500" whileHover={{ color: "#F97316" }} transition={{ duration: 0.2 }}>How it Works</motion.a>

                        <motion.a href="#pricing" className="text-[11px] font-black uppercase tracking-widest text-gray-500" whileHover={{ color: "#F97316" }} transition={{ duration: 0.2 }}>Pricing</motion.a>

                        <Link href="/careers" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-[#F97316] transition-colors">For Candidates</Link>

                    </nav>



                    <div className="flex items-center gap-3">

                        <Link href="/login" className="hidden sm:block">

                            <motion.button

                                className="h-11 px-5 text-[11px] font-black uppercase tracking-widest text-gray-600"

                                whileHover={{ color: "#F97316" }}

                                transition={{ duration: 0.2 }}

                            >

                                Sign In

                            </motion.button>

                        </Link>

                        {session ? (

                            <Link href={session.role === "SUPER_ADMIN" ? "/super-admin" : "/admin"}>

                                <motion.button

                                    className="h-11 px-6 bg-[#F97316] text-white font-black text-[11px] tracking-widest uppercase rounded-xl shadow-lg shadow-orange-500/20"

                                    whileHover={{ scale: 1.02, y: -2, backgroundColor: "#EA580C" }}

                                    whileTap={{ scale: 0.98 }}

                                    transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                >

                                    Dashboard

                                </motion.button>

                            </Link>

                        ) : (

                            <Link href="/login">

                                <motion.button

                                    className="h-11 px-6 bg-gray-900 text-white font-black text-[11px] tracking-widest uppercase rounded-xl shadow-xl"

                                    whileHover={{ scale: 1.02, y: -2, backgroundColor: "#000000" }}

                                    whileTap={{ scale: 0.98 }}

                                    transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                >

                                    Get Started

                                </motion.button>

                            </Link>

                        )}

                    </div>

                </div>

            </header>



            <main className="pt-20">

                {/*  */}

                {/* PREMIUM HERO SECTION */}

                {/*  */}

                <section className="relative overflow-hidden bg-white pt-24 pb-40">

                    {/* Background Elements */}

                    <div className="absolute inset-0">

                        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-orange-100/50 to-transparent rounded-full blur-3xl" />

                        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-blue-50/30 to-transparent rounded-full blur-3xl" />

                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-orange-50/20 to-transparent rounded-full blur-3xl" />

                    </div>



                    {/* Grid Pattern */}

                    <div className="absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.04)_1px,transparent_1px)] bg-[size:50px_50px]" />



                    <div className="max-w-6xl mx-auto px-6 relative z-10">

                        <div className="text-center space-y-10">

                            {/* Badge */}

                            <motion.div

                                className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100/50 shadow-[0_10px_30px_rgba(249,115,22,0.1)]"

                                initial={{ opacity: 0, y: -20 }}

                                animate={{ opacity: 1, y: 0 }}

                                transition={{ duration: 0.5 }}

                            >

                                <div className="h-2 w-2 rounded-full bg-[#F97316] animate-pulse shadow-[0_0_10px_rgba(249,115,22,0.5)]" />

                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#F97316]">AI-Powered Recruitment Platform</span>

                            </motion.div>



                            {/* Main Heading */}

                            <motion.div

                                className="space-y-8"

                                initial={{ opacity: 0, y: 20 }}

                                animate={{ opacity: 1, y: 0 }}

                                transition={{ duration: 0.6, delay: 0.1 }}

                            >

                                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-gray-900 leading-[0.95]">

                                    Hire the <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F97316] to-orange-600">top 1%</span> <br />

                                    with AI precision.

                                </h1>

                                <p className="text-xl text-gray-500 font-medium max-w-2xl mx-auto leading-relaxed">

                                    The enterprise recruitment OS for high-performance teams. Automate screening,

                                    conduct AI interviews, and build your dream team 10x faster.

                                </p>

                            </motion.div>



                            {/* CTA Buttons */}

                            <motion.div

                                className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"

                                initial={{ opacity: 0, y: 20 }}

                                animate={{ opacity: 1, y: 0 }}

                                transition={{ duration: 0.6, delay: 0.3 }}

                            >

                                <Link href="/login">

                                    <motion.button

                                        className="h-16 px-10 rounded-2xl bg-[#F97316] text-white font-black text-sm tracking-widest uppercase shadow-[0_20px_40px_-10px_rgba(249,115,22,0.4)] hover:shadow-[0_25px_50px_-10px_rgba(249,115,22,0.5)] group"

                                        whileHover={{ scale: 1.02, y: -2 }}

                                        whileTap={{ scale: 0.98 }}

                                        transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                    >

                                        START FREE

                                        <ArrowRight className="ml-2 h-5 w-5 inline-block group-hover:translate-x-1 transition-transform" />

                                    </motion.button>

                                </Link>

                                <motion.button

                                    className="h-16 px-10 rounded-2xl bg-white border border-gray-100 text-gray-900 font-black text-sm tracking-widest uppercase shadow-sm flex items-center gap-3"

                                    whileHover={{ scale: 1.02, y: -2, borderColor: "#9CA3AF" }}

                                    whileTap={{ scale: 0.98 }}

                                    transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                >

                                    <Play className="h-5 w-5" />

                                    WATCH DEMO

                                </motion.button>

                            </motion.div>



                            {/* Trust Indicators */}

                            <div className="flex flex-wrap items-center justify-center gap-8 pt-12 opacity-60">

                                <div className="flex items-center gap-2 text-gray-400">

                                    <CheckCircle2 className="h-4 w-4 text-green-500" />

                                    <span className="text-xs font-bold uppercase tracking-wider">No credit card required</span>

                                </div>

                                <div className="flex items-center gap-2 text-gray-400">

                                    <CheckCircle2 className="h-4 w-4 text-green-500" />

                                    <span className="text-xs font-bold uppercase tracking-wider">14-day free trial</span>

                                </div>

                                <div className="flex items-center gap-2 text-gray-400">

                                    <CheckCircle2 className="h-4 w-4 text-green-500" />

                                    <span className="text-xs font-bold uppercase tracking-wider">Cancel anytime</span>

                                </div>

                            </div>



                            {/* Brand Logos */}

                            <div className="pt-16">

                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-8">TRUSTED BY INNOVATIVE TEAMS</p>

                                <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8 opacity-35 grayscale">

                                    {['TECHFLOW', 'NEXUS', 'SKYLINE', 'ORBIT', 'VELOCITY'].map((brand) => (

                                        <span key={brand} className="text-2xl font-black tracking-tighter italic text-gray-600">{brand}</span>

                                    ))}

                                </div>

                            </div>

                        </div>

                    </div>



                    {/* Wave Divider */}

                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#FDFCFB] to-transparent" />

                </section>



                {/*  */}

                {/* STATS SECTION */}

                {/*  */}

                <section className="bg-gray-900 py-20 px-6 relative overflow-hidden">

                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-orange-500/10 to-transparent rounded-full blur-3xl" />

                    <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-orange-500/5 to-transparent rounded-full blur-3xl" />



                    <div className="max-w-5xl mx-auto relative z-10">

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">

                            {stats.map((stat, i) => (

                                <div key={i} className="text-center group" suppressHydrationWarning>

                                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white/5 border border-white/10 mb-4 group-hover:bg-orange-500/20 group-hover:border-orange-500/30 transition-all">

                                        <stat.icon className="h-6 w-6 text-orange-400" />

                                    </div>

                                    <div className="text-4xl font-black text-white tracking-tight">{stat.value}</div>

                                    <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-2">{stat.label}</div>

                                </div>

                            ))}

                        </div>

                    </div>

                </section>



                {/*  */}

                {/* FEATURES SECTION */}

                {/*  */}

                <section id="features" className="py-32 px-6 bg-white">

                    <div className="max-w-6xl mx-auto">

                        {/* Section Header */}

                        <div className="text-center mb-20">

                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] mb-6">

                                <Sparkles className="h-3 w-3" />

                                Platform Features

                            </div>

                            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-6">

                                Everything you need to <span className="text-[#F97316]">hire smarter</span>

                            </h2>

                            <p className="text-lg text-gray-500 font-medium max-w-2xl mx-auto">

                                A complete recruitment ecosystem powered by AI. From job posting to offer letter, we've got you covered.

                            </p>

                        </div>



                        {/* Features Grid */}

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">

                            {features.map((feature, i) => (

                                <div

                                    key={i}

                                    className="group p-8 rounded-[2.5rem] bg-gray-50/50 border border-gray-100 hover:border-orange-100 hover:bg-white hover:shadow-[0_30px_60px_-15px_rgba(249,115,22,0.1)] transition-all duration-500"

                                >

                                    <div className={`inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br ${feature.color} mb-6 shadow-lg group-hover:scale-110 transition-transform`}>

                                        <feature.icon className="h-6 w-6 text-white" />

                                    </div>

                                    <h3 className="text-xl font-black text-gray-900 mb-4 tracking-tight">{feature.title}</h3>

                                    <p className="text-gray-500 font-medium leading-relaxed">{feature.description}</p>

                                </div>

                            ))}

                        </div>

                    </div>

                </section>



                {/*  */}

                {/* HOW IT WORKS SECTION */}

                {/*  */}

                <section id="how-it-works" className="py-32 px-6 bg-[#FDFCFB]">

                    <div className="max-w-6xl mx-auto">

                        {/* Section Header */}

                        <div className="text-center mb-20">

                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] mb-6">

                                <Rocket className="h-3 w-3" />

                                How It Works

                            </div>

                            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-6">

                                Hire in <span className="text-[#F97316]">3 simple steps</span>

                            </h2>

                            <p className="text-lg text-gray-500 font-medium max-w-2xl mx-auto">

                                From job posting to hiring decision - streamlined with AI at every step.

                            </p>

                        </div>



                        {/* Steps */}

                        <div className="grid md:grid-cols-3 gap-8">

                            {steps.map((step, i) => (

                                <div key={i} className="relative group">

                                    {i < steps.length - 1 && (

                                        <div className="hidden md:block absolute top-16 left-[calc(100%+30px)] w-[calc(100%-60px)] h-0.5 bg-gradient-to-r from-orange-200 to-transparent" />

                                    )}



                                    <div className="p-10 rounded-[2.5rem] bg-white border border-gray-100 hover:border-orange-200 hover:shadow-[0_20px_40px_-10px_rgba(249,115,22,0.1)] transition-all duration-500 h-full" suppressHydrationWarning>

                                        <div className="text-7xl font-black text-orange-100 mb-6 group-hover:text-orange-200 transition-colors">{step.step}</div>

                                        <h3 className="text-xl font-black text-gray-900 mb-4 tracking-tight">{step.title}</h3>

                                        <p className="text-gray-500 font-medium leading-relaxed">{step.description}</p>

                                    </div>

                                </div>

                            ))}

                        </div>

                    </div>

                </section>



                {/*  */}

                {/* TESTIMONIALS SECTION */}

                {/*  */}

                <section className="py-32 px-6 bg-gray-900 text-white relative overflow-hidden">

                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-orange-500/10 to-transparent rounded-full blur-3xl" />

                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-orange-500/5 to-transparent rounded-full blur-3xl" />



                    <div className="max-w-6xl mx-auto relative z-10">

                        {/* Section Header */}

                        <div className="text-center mb-16">

                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] mb-6 border border-white/10">

                                <Award className="h-3 w-3" />

                                Trusted by Industry Leaders

                            </div>

                            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">

                                What <span className="text-[#F97316]">Clients Say</span>

                            </h2>

                        </div>



                        {/* Testimonials Grid */}

                        <div className="grid md:grid-cols-3 gap-8">

                            {testimonials.map((testimonial, i) => (

                                <div

                                    key={i}

                                    className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:border-orange-500/30 hover:bg-white/10 transition-all duration-500"

                                >

                                    {/* Stars */}

                                    <div className="flex gap-1 mb-6">

                                        {[...Array(testimonial.rating)].map((_, i) => (

                                            <Star key={i} className="h-5 w-5 fill-orange-400 text-orange-400" />

                                        ))}

                                    </div>



                                    <p className="text-gray-300 font-medium leading-relaxed mb-8">

                                        "{testimonial.quote}"

                                    </p>



                                    <div className="flex items-center gap-4">

                                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-black text-sm">

                                            {testimonial.avatar}

                                        </div>

                                        <div>

                                            <div className="font-bold text-white">{testimonial.author}</div>

                                            <div className="text-sm text-gray-400">{testimonial.role} at {testimonial.company}</div>

                                        </div>

                                    </div>

                                </div>

                            ))}

                        </div>

                    </div>

                </section>



                {/*  */}

                {/* PRICING SECTION */}

                {/*  */}

                <section id="pricing" className="py-32 px-6 bg-white">

                    <div className="max-w-5xl mx-auto">

                        {/* Section Header */}

                        <div className="text-center mb-20">

                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] mb-6">

                                <Zap className="h-3 w-3" />

                                Simple Pricing

                            </div>

                            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-6">

                                Choose your <span className="text-[#F97316]">plan</span>

                            </h2>

                            <p className="text-lg text-gray-500 font-medium max-w-2xl mx-auto">

                                Start free, scale as you grow. No hidden fees, no surprises.

                            </p>

                        </div>



                        {/* Pricing Cards */}

                        <div className="grid md:grid-cols-3 gap-8">

                            {pricing.map((plan, i) => (

                                <div

                                    key={i}

                                    className={`relative p-8 rounded-[2.5rem] border transition-all duration-500 ${plan.popular

                                            ? "bg-gray-900 border-gray-900 text-white shadow-2xl scale-105"

                                            : "bg-white border-gray-100 hover:border-orange-200 hover:shadow-xl"

                                        }`}

                                >

                                    {plan.popular && (

                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-[#F97316] text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg">

                                            Most Popular

                                        </div>

                                    )}



                                    <div className="text-center mb-8">

                                        <h3 className={`text-lg font-black uppercase tracking-widest mb-2 ${plan.popular ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>

                                        <div className="flex items-baseline justify-center gap-1">

                                            <span className={`text-5xl font-black tracking-tight ${plan.popular ? "text-white" : "text-gray-900"}`}>{plan.price}</span>

                                            <span className={`text-sm font-bold ${plan.popular ? "text-gray-400" : "text-gray-500"}`}>{plan.period}</span>

                                        </div>

                                        <p className={`text-sm mt-4 ${plan.popular ? "text-gray-400" : "text-gray-500"}`}>{plan.description}</p>

                                    </div>



                                    <ul className="space-y-4 mb-8">

                                        {plan.features.map((feature, j) => (

                                            <li key={j} className="flex items-center gap-3">

                                                <CheckCircle2 className={`h-5 w-5 shrink-0 ${plan.popular ? "text-orange-400" : "text-green-500"}`} />

                                                <span className={`text-sm font-medium ${plan.popular ? "text-gray-300" : "text-gray-600"}`}>{feature}</span>

                                            </li>

                                        ))}

                                    </ul>



                                    <motion.button

                                        className={`w-full h-14 rounded-2xl font-black text-sm tracking-widest uppercase ${plan.popular

                                                ? "bg-[#F97316] text-white shadow-lg shadow-orange-500/20"

                                                : "bg-gray-900 text-white"

                                            }`}

                                        whileHover={{ scale: 1.02, y: -2 }}

                                        whileTap={{ scale: 0.98 }}

                                        transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                    >

                                        {plan.cta}

                                    </motion.button>

                                </div>

                            ))}

                        </div>

                    </div>

                </section>



                {/*  */}

                {/* CTA SECTION */}

                {/*  */}

                <section className="py-32 px-6 bg-[#FDFCFB] relative overflow-hidden">

                    <div className="absolute inset-0">

                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-orange-100/40 to-transparent rounded-full blur-3xl" />

                    </div>



                    <div className="max-w-4xl mx-auto relative z-10 text-center">

                        <div className="p-12 md:p-16 rounded-[3rem] bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-[0_40px_80px_-20px_rgba(0,0,0,0.3)]">

                            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-orange-500 mb-8">

                                <Rocket className="h-8 w-8 text-white" />

                            </div>



                            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">

                                Ready to transform your hiring?

                            </h2>

                            <p className="text-xl text-gray-300 font-medium mb-10 max-w-xl mx-auto">

                                Join 500+ companies already hiring smarter with Sreeva AI. Start your free trial today.

                            </p>



                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">

                                <Link href="/login">

                                    <motion.button

                                        className="h-16 px-12 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black text-lg shadow-[0_20px_40px_-10px_rgba(249,115,22,0.4)]"

                                        whileHover={{ scale: 1.02, y: -2 }}

                                        whileTap={{ scale: 0.98 }}

                                        transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                    >

                                        GET STARTED FREE

                                        <ArrowRight className="ml-2 h-5 w-5 inline-block" />

                                    </motion.button>

                                </Link>

                                <motion.button

                                    className="h-16 px-12 rounded-2xl border border-white/20 text-white hover:bg-white/10 font-black text-lg"

                                    whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.1)" }}

                                    whileTap={{ scale: 0.98 }}

                                    transition={{ type: "spring", stiffness: 400, damping: 17 }}

                                >

                                    <Play className="mr-2 h-5 w-5 inline-block" />

                                    WATCH DEMO

                                </motion.button>

                            </div>

                        </div>

                    </div>

                </section>

            </main>



            {/* Premium Footer */}

            <footer className="border-t border-gray-100 py-20 bg-white">

                <div className="max-w-6xl mx-auto px-6">

                    <div className="grid md:grid-cols-4 gap-12 mb-16">

                        <div className="col-span-2 space-y-6">

                            <div className="flex items-center gap-3">

                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center">

                                    <Briefcase className="h-5 w-5 text-white" />

                                </div>

                                <span className="text-xl font-black text-gray-900">Sreeva<span className="text-[#F97316]"> AI</span></span>

                            </div>

                            <p className="text-gray-500 max-w-sm font-medium leading-relaxed">

                                The world's first AI-native recruitment ecosystem designed for technical excellence and human intuition.

                            </p>

                            <div className="flex gap-4">

                                <a href="#" className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-[#F97316] hover:text-white transition-all">

                                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>

                                </a>

                                <a href="#" className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-[#F97316] hover:text-white transition-all">

                                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>

                                </a>

                                <a href="#" className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-[#F97316] hover:text-white transition-all">

                                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>

                                </a>

                            </div>

                        </div>

                        <div className="space-y-6">

                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Product</h4>

                            <div className="flex flex-col gap-4">

                                <a href="#features" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Features</a>

                                <a href="#pricing" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Pricing</a>

                                <a href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">API</a>

                            </div>

                        </div>

                        <div className="space-y-6">

                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Company</h4>

                            <div className="flex flex-col gap-4">

                                <a href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">About</a>

                                <a href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Blog</a>

                                <a href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Careers</a>

                                <a href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Contact</a>

                            </div>

                        </div>

                    </div>

                    <div className="pt-8 border-t border-gray-50 flex flex-col md:flex-row items-center justify-between gap-4">

                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">© 2026 Sreeva AI. All rights reserved.</p>

                        <div className="flex gap-6">

                            <a href="#" className="text-xs font-bold text-gray-400 hover:text-gray-900 transition-colors">Privacy Policy</a>

                            <a href="#" className="text-xs font-bold text-gray-400 hover:text-gray-900 transition-colors">Terms of Service</a>

                        </div>

                    </div>

                </div>

            </footer>

        </div>

    );

}

