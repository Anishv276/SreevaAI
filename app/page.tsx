import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      {/* Extracted from Stitch HTML */}
      
{/*  TopNavBar  */}
<nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-orange-100/20 dark:border-slate-800 shadow-sm h-20">
<div className="max-w-[1320px] mx-auto flex justify-between items-center h-full px-6">
<div className="text-2xl font-black tracking-tighter text-orange-600 font-display">Sreeva AI</div>
<div className="hidden md:flex gap-8 items-center font-inter text-sm font-medium tracking-tight">
<a className="text-orange-600 font-bold border-b-2 border-orange-600 pb-1" href="#">Product</a>
<a className="text-slate-600 dark:text-slate-400 hover:text-orange-600 transition-colors" href="#">Solutions</a>
<a className="text-slate-600 dark:text-slate-400 hover:text-orange-600 transition-colors" href="#">Pricing</a>
<a className="text-slate-600 dark:text-slate-400 hover:text-orange-600 transition-colors" href="#">Resources</a>
</div>
<div className="flex items-center gap-4">
<button className="text-slate-600 font-medium px-4 py-2 hover:bg-orange-50 rounded-lg transition-all">Login</button>
<button className="bg-primary-container text-on-primary px-6 py-2.5 rounded-lg font-bold scale-95 active:scale-90 transition-transform">Get Started</button>
</div>
</div>
</nav>
{/*  Hero Section  */}
<section className="pt-32 pb-24 px-6 max-w-[1320px] mx-auto overflow-hidden">
<div className="flex flex-col lg:flex-row items-center gap-16">
<div className="lg:w-1/2 space-y-8">
<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-container text-label-sm font-medium">
<span className="material-symbols-outlined text-sm">auto_awesome</span>
                    Introducing v2.4 Adaptive Assessment
                </div>
<h1 className="font-display text-h1 text-on-background leading-tight">
                    Adaptive AI interviews that screen candidates <span className="text-primary">before</span> your team spends time
                </h1>
<p className="text-body-lg text-on-surface-variant max-w-lg">
                    Stop drowning in resumes. Sreeva conducts deep, conversational technical interviews that adapt to the candidate's expertise level in real-time.
                </p>
<div className="flex flex-col sm:flex-row gap-4">
<button className="primary-btn px-8 py-4 font-bold text-lg">Start Free Trial</button>
<button className="secondary-btn px-8 py-4 font-bold text-lg flex items-center gap-2">
<span className="material-symbols-outlined">play_circle</span>
                        See Sreeva in Action
                    </button>
</div>
<div className="pt-8 flex flex-col gap-4">
<p className="text-caption text-outline uppercase font-bold tracking-widest">Trusted by hiring teams at</p>
<div className="flex flex-wrap gap-8 opacity-40 grayscale">
<div className="h-8 w-24 bg-on-background/10 rounded"></div>
<div className="h-8 w-28 bg-on-background/10 rounded"></div>
<div className="h-8 w-20 bg-on-background/10 rounded"></div>
<div className="h-8 w-24 bg-on-background/10 rounded"></div>
</div>
</div>
</div>
{/*  Hero Mockup Cluster  */}
<div className="lg:w-1/2 relative">
<div className="bento-card p-4 bg-surface-container-lowest shadow-2xl relative z-10">
<div className="flex items-center justify-between mb-6 border-b border-surface-variant pb-4">
<div className="flex items-center gap-3">
<div className="w-12 h-12 rounded-full overflow-hidden bg-primary-fixed">
<img alt="Candidate" className="w-full h-full object-cover" data-alt="professional portrait of a confident south asian female candidate with a warm smile in a brightly lit office setting" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBnGnEQXagubwGRxhEMmkoDL5AKdX4-V0J1KtSR8j5v98Oi_iQJ2z39YrMPiQ_JNHIRGjPepRQCAkqKHcDprDbY5OCOiV2vlh0NoIY36O9QXTgITxpGVN5QgWqEA_JHSVd9kBc9qqYuP0mNg0ochRAVwBNuitIKBq4U-CReDJ_RqorRTibdrqMr-TJlnupIL5GJfnPjipSKnfjntqc9FlK1UAFnNMYIFGTINS3amhppLmNpVyhEv6h1HM-qR6UAbMY-Ky71BL3N-vQ"/>
</div>
<div>
<h3 className="font-bold text-on-background">Ananya Rao</h3>
<p className="text-caption text-on-surface-variant">Product Designer • Applied 2h ago</p>
</div>
</div>
<div className="text-right">
<div className="text-h3 font-black text-primary">88<span className="text-body-md text-outline font-normal">/100</span></div>
<div className="text-caption font-bold text-secondary">MATCH SCORE</div>
</div>
</div>
<div className="space-y-6">
<div className="bg-surface p-4 rounded-xl border border-surface-variant">
<div className="flex items-center gap-2 mb-2 text-primary">
<span className="material-symbols-outlined text-sm">psychology</span>
<span className="text-caption font-bold uppercase">Sreeva AI Question</span>
</div>
<p className="text-body-md italic text-on-surface">"Given the data density in the dashboard mockup, how would you prioritize information hierarchy for a mobile user?"</p>
</div>
<div className="grid grid-cols-2 gap-4">
<div className="space-y-2">
<div className="flex justify-between text-caption font-medium">
<span>Visual Design</span>
<span>92%</span>
</div>
<div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
<div className="h-full bg-primary w-[92%] rounded-full"></div>
</div>
</div>
<div className="space-y-2">
<div className="flex justify-between text-caption font-medium">
<span>UX Strategy</span>
<span>84%</span>
</div>
<div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
<div className="h-full bg-primary w-[84%] rounded-full"></div>
</div>
</div>
</div>
</div>
</div>
{/*  Floating Cards  */}
<div className="absolute -top-6 -right-6 bento-card p-3 flex items-center gap-3 shadow-lg z-20 bg-white border-l-4 border-l-green-500">
<span className="material-symbols-outlined text-green-500">check_circle</span>
<span className="text-caption font-bold">Resume matched</span>
</div>
<div className="absolute top-1/4 -left-12 bento-card p-3 flex items-center gap-3 shadow-lg z-20 bg-white border-l-4 border-l-primary">
<span className="material-symbols-outlined text-primary">psychology</span>
<span className="text-caption font-bold">JD skills detected</span>
</div>
<div className="absolute bottom-1/4 -right-8 bento-card p-3 flex items-center gap-3 shadow-lg z-20 bg-white border-l-4 border-l-blue-500">
<span className="material-symbols-outlined text-blue-500">forward_to_inbox</span>
<span className="text-caption font-bold">Follow-up triggered</span>
</div>
<div className="absolute -bottom-4 left-1/4 bento-card p-3 flex items-center gap-3 shadow-lg z-20 bg-white border-l-4 border-l-orange-500">
<span className="material-symbols-outlined text-orange-500">analytics</span>
<span className="text-caption font-bold">Report generated</span>
</div>
</div>
</div>
</section>
{/*  Problem Section  */}
<section className="py-24 bg-surface-container-low">
<div className="max-w-[1320px] mx-auto px-6 text-center mb-16">
<h2 className="font-display text-h2 mb-4">Hiring is broken. We fixed it.</h2>
<p className="text-body-lg text-outline max-w-2xl mx-auto">Manual screening wastes 60% of recruiter time on candidates that aren't a fit.</p>
</div>
<div className="max-w-[1320px] mx-auto px-6 grid md:grid-cols-3 gap-8">
<div className="bento-card p-8 text-center space-y-4">
<div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
<span className="material-symbols-outlined text-3xl">timer_off</span>
</div>
<h3 className="font-bold text-xl">Extremely Slow</h3>
<p className="text-on-surface-variant">Weeks spent on initial phone screens that could have been avoided with better data.</p>
</div>
<div className="bento-card p-8 text-center space-y-4">
<div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
<span className="material-symbols-outlined text-3xl">scale</span>
</div>
<h3 className="font-bold text-xl">Highly Inconsistent</h3>
<p className="text-on-surface-variant">Subjective interviewing leads to biased hiring and poor diversity outcomes.</p>
</div>
<div className="bento-card p-8 text-center space-y-4">
<div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
<span className="material-symbols-outlined text-3xl">description</span>
</div>
<h3 className="font-bold text-xl">Resume Deception</h3>
<p className="text-on-surface-variant">Keywords on paper don't always translate to actual skills during the job.</p>
</div>
</div>
</section>
{/*  Bento Grid  */}
<section className="py-24 px-6 max-w-[1320px] mx-auto">
<div className="grid grid-cols-12 gap-gutter auto-rows-[200px]">
{/*  Main Bento 1  */}
<div className="col-span-12 lg:col-span-6 row-span-2 bento-card p-8 flex flex-col justify-between group">
<div>
<span className="inline-block px-3 py-1 bg-primary/10 text-primary text-caption font-bold rounded-full mb-4">CORE ENGINE</span>
<h3 className="font-display text-h3 mb-4">Adaptive Interview Engine</h3>
<p className="text-on-surface-variant max-w-md">Our AI doesn't follow a script. It follows the candidate. If they're an expert, it dives deeper. If they struggle, it pivots to find their core strengths.</p>
</div>
<div className="mt-8 bg-surface-container rounded-xl overflow-hidden border border-surface-variant p-4">
<div className="flex items-center gap-2 mb-3">
<div className="w-2 h-2 rounded-full bg-green-500"></div>
<span className="text-caption font-bold">LIVE TRANSCRIPTION</span>
</div>
<div className="space-y-2 opacity-60">
<div className="h-4 bg-on-surface/10 rounded w-3/4"></div>
<div className="h-4 bg-on-surface/10 rounded w-1/2"></div>
</div>
</div>
</div>
{/*  Main Bento 2  */}
<div className="col-span-12 lg:col-span-6 row-span-2 bento-card p-8 flex flex-col justify-between bg-primary-container group">
<div className="text-on-primary">
<span className="inline-block px-3 py-1 bg-white/20 text-white text-caption font-bold rounded-full mb-4">DATA INSIGHTS</span>
<h3 className="font-display text-h3 mb-4">AI Report Preview</h3>
<p className="opacity-90 max-w-md">Get a structured breakdown of every skill, proctoring signals, and a clear hiring recommendation in under 60 seconds after the interview ends.</p>
</div>
<div className="mt-8 relative h-40 overflow-hidden">
<img alt="Dashboard" className="rounded-t-xl shadow-lg border-t-2 border-white/20" data-alt="clean data dashboard showing colorful charts, progress bars, and analytics widgets with a modern dark UI theme" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNF1H8IUMiagmA5Siq1LKCiklzW8F0gHcgY3ljeGDagpD2kpppeZoXRrEkL1MsAV27cct_10CuB7hdktg3DTpXuP-LgKMqwI7op2YZb-aS8ALA5e6SzMGpCAS56Ct4FI7vvrguGLjuVlYt4xR2P4VSg5REpmV2oJkuhBbZcRXwxSBvcimG21fCFc4HQhHobgOlfADIXJFdh-8Ul1d8o7PPjKtvjonZSKp0JVRszPMYfxWxe3p-RVRAw8zu-VbX7uJMxDd9aak7Owk"/>
</div>
</div>
{/*  Small Bento Cards  */}
<div className="col-span-12 md:col-span-4 row-span-1 bento-card p-6 flex flex-col gap-2">
<span className="material-symbols-outlined text-primary">data_object</span>
<h4 className="font-bold">Resume Intelligence</h4>
<p className="text-caption text-on-surface-variant">Extracts hidden nuances, not just keywords, to map potential.</p>
</div>
<div className="col-span-12 md:col-span-4 row-span-1 bento-card p-6 flex flex-col gap-2">
<span className="material-symbols-outlined text-primary">repeat</span>
<h4 className="font-bold">Smart Follow-ups</h4>
<p className="text-caption text-on-surface-variant">The AI asks "How?" and "Why?" just like a human senior lead.</p>
</div>
<div className="col-span-12 md:col-span-4 row-span-1 bento-card p-6 flex flex-col gap-2">
<span className="material-symbols-outlined text-primary">verified_user</span>
<h4 className="font-bold">Proctoring</h4>
<p className="text-caption text-on-surface-variant">Anti-cheating signals and tab-switching alerts keep it honest.</p>
</div>
<div className="col-span-12 md:col-span-4 row-span-1 bento-card p-6 flex flex-col gap-2">
<span className="material-symbols-outlined text-primary">videocam</span>
<h4 className="font-bold">Video Analysis</h4>
<p className="text-caption text-on-surface-variant">Analyze non-verbal cues and communication clarity scores.</p>
</div>
<div className="col-span-12 md:col-span-4 row-span-1 bento-card p-6 flex flex-col gap-2">
<span className="material-symbols-outlined text-primary">terminal</span>
<h4 className="font-bold">Skill Proof</h4>
<p className="text-caption text-on-surface-variant">Live coding environments embedded directly in the interview.</p>
</div>
<div className="col-span-12 md:col-span-4 row-span-1 bento-card p-6 flex flex-col gap-2">
<span className="material-symbols-outlined text-primary">group</span>
<h4 className="font-bold">Team Review</h4>
<p className="text-caption text-on-surface-variant">Share snippets of the interview with hiring managers instantly.</p>
</div>
</div>
</section>
{/*  Workflow Section  */}
<section className="py-24 bg-surface">
<div className="max-w-[1320px] mx-auto px-6">
<h2 className="font-display text-h2 text-center mb-16">The Sreeva Workflow</h2>
<div className="flex flex-col md:flex-row items-center gap-4 relative">
{/*  Step 1  */}
<div className="flex-1 text-center space-y-4 z-10">
<div className="w-16 h-16 rounded-full bg-white border-4 border-primary mx-auto flex items-center justify-center font-bold text-xl shadow-lg">1</div>
<h3 className="font-bold">JD Upload</h3>
<p className="text-caption text-outline">Upload your JD or paste the link. AI builds the map.</p>
</div>
<div className="hidden md:block h-0.5 flex-1 bg-primary/20 relative -mt-16">
<div className="absolute inset-0 bg-primary w-1/2"></div>
</div>
{/*  Step 2  */}
<div className="flex-1 text-center space-y-4 z-10">
<div className="w-16 h-16 rounded-full bg-white border-4 border-primary mx-auto flex items-center justify-center font-bold text-xl shadow-lg">2</div>
<h3 className="font-bold">AI Plan</h3>
<p className="text-caption text-outline">Sreeva designs the adaptive questioning path.</p>
</div>
<div className="hidden md:block h-0.5 flex-1 bg-primary/20 relative -mt-16">
<div className="absolute inset-0 bg-primary w-0"></div>
</div>
{/*  Step 3  */}
<div className="flex-1 text-center space-y-4 z-10">
<div className="w-16 h-16 rounded-full bg-white border-4 border-primary mx-auto flex items-center justify-center font-bold text-xl shadow-lg">3</div>
<h3 className="font-bold">Interview</h3>
<p className="text-caption text-outline">Candidate interacts with our conversational AI.</p>
</div>
<div className="hidden md:block h-0.5 flex-1 bg-primary/20 relative -mt-16">
<div className="absolute inset-0 bg-primary w-0"></div>
</div>
{/*  Step 4  */}
<div className="flex-1 text-center space-y-4 z-10">
<div className="w-16 h-16 rounded-full bg-white border-4 border-primary mx-auto flex items-center justify-center font-bold text-xl shadow-lg">4</div>
<h3 className="font-bold">Decision Report</h3>
<p className="text-caption text-outline">You get a score, recording, and hire/pass rec.</p>
</div>
</div>
</div>
</section>
{/*  Comparison Section  */}
<section className="py-24 px-6 max-w-[1320px] mx-auto">
<div className="grid md:grid-cols-2 gap-8">
<div className="bento-card p-10 bg-slate-50 border-slate-200">
<h3 className="font-bold text-h3 mb-6 flex items-center gap-2">
<span className="material-symbols-outlined text-slate-400">event_busy</span>
                    Manual Screening
                </h3>
<div className="space-y-4 opacity-60">
<div className="flex gap-3 p-3 bg-white rounded-lg border border-slate-200">
<div className="w-10 h-10 bg-slate-100 rounded-full"></div>
<div className="flex-1 space-y-2">
<div className="h-3 w-1/3 bg-slate-200 rounded"></div>
<div className="h-12 w-full bg-slate-100 rounded"></div>
</div>
</div>
<div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center text-caption italic">
                        "I think they were good? My notes are messy..."
                    </div>
<div className="flex justify-between items-center px-4 py-2 bg-red-50 text-red-700 rounded-lg font-bold text-caption">
<span>TIME TO DECISION</span>
<span>4-7 DAYS</span>
</div>
</div>
</div>
<div className="bento-card p-10 border-primary/30 ring-4 ring-primary/5">
<h3 className="font-bold text-h3 mb-6 flex items-center gap-2 text-primary">
<span className="material-symbols-outlined">bolt</span>
                    Sreeva AI
                </h3>
<div className="space-y-4">
<div className="flex gap-3 p-3 bg-white rounded-lg border border-primary-fixed shadow-sm">
<div className="w-10 h-10 bg-primary-fixed rounded-full flex items-center justify-center text-primary">
<span className="material-symbols-outlined">check</span>
</div>
<div className="flex-1 space-y-2">
<div className="h-3 w-1/2 bg-primary/20 rounded"></div>
<div className="h-12 w-full bg-primary/5 rounded"></div>
</div>
</div>
<div className="p-4 bg-primary-fixed/30 rounded-xl flex items-center gap-4">
<div className="text-h2 font-black text-primary">92%</div>
<div className="text-caption font-bold leading-tight">PREDICTIVE<br/>ACCURACY</div>
</div>
<div className="flex justify-between items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg font-bold text-caption">
<span>TIME TO DECISION</span>
<span>15 MINUTES</span>
</div>
</div>
</div>
</div>
</section>
{/*  Dashboard Report Preview  */}
<section className="py-24 bg-surface-container-low overflow-hidden">
<div className="max-w-[1320px] mx-auto px-6">
<div className="text-center mb-16">
<h2 className="font-display text-h2 mb-4">The Most Detailed Report Ever</h2>
<p className="text-body-lg text-outline">Every interview generates a comprehensive dossier.</p>
</div>
<div className="bento-card p-0 shadow-2xl bg-white max-w-5xl mx-auto overflow-hidden">
<div className="p-6 border-b flex items-center justify-between bg-surface">
<div className="flex items-center gap-4">
<div className="w-12 h-12 rounded-lg bg-primary-container text-white flex items-center justify-center font-bold text-xl">S</div>
<div>
<h4 className="font-bold text-lg">Interview Report #8291</h4>
<p className="text-caption">Role: Senior Frontend Engineer</p>
</div>
</div>
<button className="secondary-btn px-4 py-2 text-label-sm font-bold flex items-center gap-2">
<span className="material-symbols-outlined text-sm">download</span>
                        Export PDF
                    </button>
</div>
<div className="p-8 grid grid-cols-12 gap-8">
<div className="col-span-12 md:col-span-4 space-y-8">
<div className="text-center p-6 bg-surface rounded-2xl border">
<div className="text-display font-black text-primary mb-1">94</div>
<div className="text-caption font-bold text-outline mb-4">OVERALL SCORE</div>
<div className="inline-flex px-4 py-2 bg-green-100 text-green-700 rounded-full font-bold text-caption items-center gap-2">
<span className="material-symbols-outlined text-sm" style={{fontVariationSettings: "'FILL' 1"}}>recommend</span>
                                STRONG HIRE
                            </div>
</div>
<div className="space-y-4">
<h5 className="font-bold text-sm uppercase tracking-wider text-outline">Proctoring Signals</h5>
<div className="space-y-3">
<div className="flex items-center justify-between text-caption">
<span className="flex items-center gap-2"><span className="material-symbols-outlined text-green-500 text-sm">check</span>Identity Verified</span>
<span className="text-green-600 font-bold">Safe</span>
</div>
<div className="flex items-center justify-between text-caption">
<span className="flex items-center gap-2"><span className="material-symbols-outlined text-green-500 text-sm">check</span>Tab Switching</span>
<span className="text-green-600 font-bold">None</span>
</div>
<div className="flex items-center justify-between text-caption">
<span className="flex items-center gap-2"><span className="material-symbols-outlined text-green-500 text-sm">check</span>Background Audio</span>
<span className="text-green-600 font-bold">Clean</span>
</div>
</div>
</div>
</div>
<div className="col-span-12 md:col-span-8 space-y-8">
<div>
<h5 className="font-bold text-sm uppercase tracking-wider text-outline mb-4">Skills Proficiency</h5>
<div className="grid grid-cols-2 gap-6">
<div className="space-y-2">
<div className="flex justify-between text-caption font-bold"><span>React &amp; State Management</span><span>Expert</span></div>
<div className="h-2 bg-surface-variant rounded-full"><div className="h-full bg-primary w-full rounded-full"></div></div>
</div>
<div className="space-y-2">
<div className="flex justify-between text-caption font-bold"><span>Performance Optimization</span><span>Expert</span></div>
<div className="h-2 bg-surface-variant rounded-full"><div className="h-full bg-primary w-[90%] rounded-full"></div></div>
</div>
<div className="space-y-2">
<div className="flex justify-between text-caption font-bold"><span>System Design</span><span>Advanced</span></div>
<div className="h-2 bg-surface-variant rounded-full"><div className="h-full bg-primary w-[75%] rounded-full"></div></div>
</div>
<div className="space-y-2">
<div className="flex justify-between text-caption font-bold"><span>Communication</span><span>Excellent</span></div>
<div className="h-2 bg-surface-variant rounded-full"><div className="h-full bg-primary w-[95%] rounded-full"></div></div>
</div>
</div>
</div>
<div className="p-6 bg-surface rounded-2xl border">
<h5 className="font-bold text-sm uppercase tracking-wider text-outline mb-4">Recording Timeline</h5>
<div className="h-24 bg-surface-container rounded-lg border-2 border-dashed flex items-center justify-center">
<span className="material-symbols-outlined text-4xl text-outline opacity-30">play_arrow</span>
</div>
</div>
</div>
</div>
</div>
</div>
</section>
{/*  Pricing Section  */}
<section className="py-24 px-6 max-w-[1320px] mx-auto">
<div className="text-center mb-16">
<h2 className="font-display text-h2 mb-4">Simple, Transparent Pricing</h2>
<p className="text-body-lg text-outline">Choose the plan that fits your hiring velocity.</p>
</div>
<div className="grid md:grid-cols-4 gap-6">
<div className="bento-card p-8 flex flex-col">
<h3 className="font-bold text-xl mb-2">Starter</h3>
<div className="text-h3 font-black mb-4">$0<span className="text-caption text-outline font-normal">/mo</span></div>
<ul className="space-y-3 mb-8 flex-1 text-sm text-on-surface-variant">
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> 5 Interviews/mo</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> Basic AI Reports</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> 1 Admin Seat</li>
</ul>
<button className="secondary-btn w-full py-3 font-bold">Get Started</button>
</div>
<div className="bento-card p-8 flex flex-col ring-4 ring-primary/10 border-primary shadow-xl scale-105 z-10">
<div className="text-primary font-bold text-caption uppercase mb-2">MOST POPULAR</div>
<h3 className="font-bold text-xl mb-2">Growth</h3>
<div className="text-h3 font-black mb-4">$499<span className="text-caption text-outline font-normal">/mo</span></div>
<ul className="space-y-3 mb-8 flex-1 text-sm text-on-surface-variant">
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> 50 Interviews/mo</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> Advanced Skills Proof</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> 5 Admin Seats</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> ATS Integrations</li>
</ul>
<button className="primary-btn w-full py-3 font-bold">Try Growth</button>
</div>
<div className="bento-card p-8 flex flex-col">
<h3 className="font-bold text-xl mb-2">Scale</h3>
<div className="text-h3 font-black mb-4">$1,299<span className="text-caption text-outline font-normal">/mo</span></div>
<ul className="space-y-3 mb-8 flex-1 text-sm text-on-surface-variant">
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> 200 Interviews/mo</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> White-labeled Portal</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> Unlimited Seats</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> Priority Support</li>
</ul>
<button className="secondary-btn w-full py-3 font-bold">Contact Sales</button>
</div>
<div className="bento-card p-8 flex flex-col">
<h3 className="font-bold text-xl mb-2">Business</h3>
<div className="text-h3 font-black mb-4 text-2xl">Custom</div>
<ul className="space-y-3 mb-8 flex-1 text-sm text-on-surface-variant">
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> Unlimited Interviews</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> Custom AI Fine-tuning</li>
<li className="flex gap-2"><span className="material-symbols-outlined text-primary text-sm">check</span> SSO &amp; Enterprise Security</li>
</ul>
<button className="secondary-btn w-full py-3 font-bold">Talk to Us</button>
</div>
</div>
</section>
{/*  FAQ Section  */}
<section className="py-24 bg-surface-container-low">
<div className="max-w-[1320px] mx-auto px-6">
<h2 className="font-display text-h2 text-center mb-16">Frequently Asked Questions</h2>
<div className="grid md:grid-cols-2 gap-8">
<div className="space-y-4">
<div className="bento-card p-6">
<h4 className="font-bold mb-2 flex justify-between items-center">Is the AI biased? <span className="material-symbols-outlined text-outline">expand_more</span></h4>
<p className="text-caption text-on-surface-variant">No. Sreeva uses objective skill-mapping protocols that ignore demographic data, focusing purely on technical and behavioral competency.</p>
</div>
<div className="bento-card p-6">
<h4 className="font-bold mb-2 flex justify-between items-center">Can it detect ChatGPT use? <span className="material-symbols-outlined text-outline">expand_more</span></h4>
<p className="text-caption text-on-surface-variant">Yes, our engine detects tab-switching, copy-pasting, and unnatural response patterns typical of AI assistance.</p>
</div>
</div>
<div className="space-y-4">
<div className="bento-card p-6">
<h4 className="font-bold mb-2 flex justify-between items-center">How long are the interviews? <span className="material-symbols-outlined text-outline">expand_more</span></h4>
<p className="text-caption text-on-surface-variant">On average, Sreeva interviews last 15-25 minutes, tailored dynamically based on the candidate's speed and depth.</p>
</div>
<div className="bento-card p-6">
<h4 className="font-bold mb-2 flex justify-between items-center">Does it integrate with my ATS? <span className="material-symbols-outlined text-outline">expand_more</span></h4>
<p className="text-caption text-on-surface-variant">Yes, we support Greenhouse, Lever, Workday, and 20+ other major recruiting platforms.</p>
</div>
</div>
</div>
</div>
</section>
{/*  Contact Form Section  */}
<section className="py-24 px-6 max-w-[1320px] mx-auto">
<div className="flex flex-col lg:flex-row gap-16">
<div className="lg:w-1/2 space-y-6">
<h2 className="font-display text-h2">Ready to transform your hiring?</h2>
<p className="text-body-lg text-outline">Join 500+ companies using Sreeva AI to hire faster and better.</p>
<div className="bento-card p-8 bg-primary-container text-on-primary">
<div className="flex items-center gap-4 mb-6">
<div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
<span className="material-symbols-outlined">call</span>
</div>
<div>
<div className="font-bold">Book a Strategy Call</div>
<div className="text-caption opacity-80">Free 15-min consultation</div>
</div>
</div>
<p className="italic text-sm">"Sreeva reduced our technical screening time by 75% in the first month alone."</p>
<div className="mt-4 flex items-center gap-2">
<div className="w-8 h-8 rounded-full bg-slate-200"></div>
<span className="text-caption font-bold">— CTO, TechFlow Systems</span>
</div>
</div>
</div>
<div className="lg:w-1/2">
<form className="bento-card p-8 space-y-6 shadow-xl border-primary-fixed">
<div className="grid grid-cols-2 gap-4">
<div className="space-y-2">
<label className="text-caption font-bold uppercase tracking-wider text-outline">Full Name</label>
<input className="w-full bg-surface border-surface-variant rounded-xl p-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all" placeholder="Jane Doe" type="text"/>
</div>
<div className="space-y-2">
<label className="text-caption font-bold uppercase tracking-wider text-outline">Company Email</label>
<input className="w-full bg-surface border-surface-variant rounded-xl p-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all" placeholder="jane@company.com" type="email"/>
</div>
</div>
<div className="space-y-2">
<label className="text-caption font-bold uppercase tracking-wider text-outline">Monthly Hiring Volume</label>
<select className="w-full bg-surface border-surface-variant rounded-xl p-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all">
<option>1-5 candidates</option>
<option>5-20 candidates</option>
<option>20-50 candidates</option>
<option>50+ candidates</option>
</select>
</div>
<div className="space-y-2">
<label className="text-caption font-bold uppercase tracking-wider text-outline">How can we help?</label>
<textarea className="w-full bg-surface border-surface-variant rounded-xl p-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all h-32" placeholder="Tell us about your current screening process..."></textarea>
</div>
<button className="primary-btn w-full py-4 font-bold text-lg" type="submit">Send Message</button>
</form>
</div>
</div>
</section>
{/*  Footer  */}
<footer className="bg-white dark:bg-slate-950 w-full py-12 border-t border-slate-100 dark:border-slate-800">
<div className="max-w-[1320px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
<div className="col-span-2">
<div className="text-xl font-bold text-slate-900 dark:text-white mb-4">Sreeva AI</div>
<p className="font-inter text-sm text-slate-500 mb-6 max-w-xs">Building the future of talent assessment through adaptive artificial intelligence.</p>
<div className="flex gap-4">
<div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-primary transition-colors cursor-pointer"><span className="material-symbols-outlined text-sm">public</span></div>
<div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-primary transition-colors cursor-pointer"><span className="material-symbols-outlined text-sm">alternate_email</span></div>
</div>
</div>
<div>
<h5 className="font-bold text-sm mb-4">Product</h5>
<ul className="space-y-2 font-inter text-sm text-slate-500">
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Adaptive Engine</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Skill Library</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Integrations</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Security</a></li>
</ul>
</div>
<div>
<h5 className="font-bold text-sm mb-4">Company</h5>
<ul className="space-y-2 font-inter text-sm text-slate-500">
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Careers</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">About Us</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Blog</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">News</a></li>
</ul>
</div>
<div>
<h5 className="font-bold text-sm mb-4">Legal</h5>
<ul className="space-y-2 font-inter text-sm text-slate-500">
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Privacy Policy</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Terms of Service</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Security</a></li>
</ul>
</div>
<div>
<h5 className="font-bold text-sm mb-4">Support</h5>
<ul className="space-y-2 font-inter text-sm text-slate-500">
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Contact Sales</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Status</a></li>
<li><a className="hover:text-orange-600 hover:underline decoration-orange-500 underline-offset-4" href="#">Help Center</a></li>
</ul>
</div>
</div>
<div className="max-w-[1320px] mx-auto px-6 mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
<p className="font-inter text-sm text-slate-500">© 2024 Sreeva AI. All rights reserved.</p>
</div>
</footer>

    </>
  );
}
