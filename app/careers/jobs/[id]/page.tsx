"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CandidateHeader } from "@/components/careers/header";
import { CandidateFooter } from "@/components/careers/footer";
import { ArrowLeft, Clock, MapPin, Users, DollarSign, CheckCircle2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useJobs } from "@/context/jobs-context";

export default function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const { jobs } = useJobs(); // Use context
    const [job, setJob] = useState<any>(null);
    const router = useRouter();
    const { isAuthenticated } = useAuth(); // Assuming auth context exists or removed if not

    useEffect(() => {
        if (jobs.length > 0) {
            const foundJob = jobs.find((j) => j.id.toString() === resolvedParams.id);
            setJob(foundJob);
        } else {
            // Fallback fetch if context empty (e.g. refresh)
            fetch(`/api/drives/${resolvedParams.id}`)
                .then(res => res.json())
                .then(data => setJob(data))
                .catch(err => console.error(err));
        }
    }, [resolvedParams.id, jobs]);

    const handleApply = () => {
        if (!job) return;

        if (isAuthenticated) {
            router.push(`/careers/apply?jobId=${job.id}`);
        } else {
            // Save intention to apply
            localStorage.setItem("pendingJobId", job.id.toString());
            router.push("/signin");
        }
    };

    if (!job) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <CandidateHeader />
                <main className="flex-1 container py-20 text-center">
                    <p>Loading job details...</p>
                </main>
            </div>
        );
    }

    // Extended mock data for the view
    const salary = "$120k - $180k";
    const responsibilities = [
        "Design and build scalable RESTful APIs",
        "Optimize database queries and system performance",
        "Write clean, maintainable, well-documented code",
        "Collaborate with frontend and mobile teams",
        "Participate in code reviews"
    ];
    const requirements = [
        "5+ years of backend development experience",
        "Strong proficiency in Node.js or Python",
        "Experience with PostgreSQL, MongoDB",
        "Solid understanding of RESTful API design",
        "Familiarity with AWS, GCP, or Azure"
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <CandidateHeader />

            <main className="flex-1 container max-w-4xl py-12 px-4">
                <Link
                    href="/"
                    className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-blue-600 mb-8 transition-colors"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
                </Link>

                {/* Job Header Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 animate-in-slide-up">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">{job.title}</h1>
                            <div className="flex flex-wrap items-center gap-4 text-gray-600 text-sm">
                                <span className="font-medium text-blue-600">{job.department}</span>
                                <span>•</span>
                                <span>Full-time</span>
                            </div>

                            <div className="flex flex-wrap gap-4 mt-6">
                                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-full">
                                    <MapPin className="h-4 w-4 text-gray-500" /> {job.location}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                                    <DollarSign className="h-4 w-4 text-green-600" /> {salary}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-full">
                                    <Users className="h-4 w-4 text-gray-500" /> {job.applicants} applicants
                                </div>
                                <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
                                    <Clock className="h-4 w-4" /> Closes in {job.daysLeft} days
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center min-w-[200px]">
                            <Button size="lg" onClick={handleApply} className="w-full bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                                Apply for this Role <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <div className="grid gap-8 animate-in-slide-up" style={{ animationDelay: "0.1s" }}>

                    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">About the Role</h2>
                        <div className="prose max-w-none text-gray-600 leading-relaxed">
                            <p>
                                We&apos;re looking for an experienced backend engineer to join our core platform team.
                                You&apos;ll be responsible for designing and building scalable APIs that serve millions of users globally.
                                This role offers the opportunity to work with cutting-edge technologies, collaborate with talented
                                engineers, and make a real impact on our product.
                            </p>
                        </div>
                    </section>

                    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">Key Responsibilities</h2>
                        <ul className="space-y-4">
                            {responsibilities.map((item, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                                    <span className="text-gray-700">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">Requirements</h2>
                        <ul className="space-y-4">
                            {requirements.map((item, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400 mt-2" />
                                    <span className="text-gray-700">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="bg-blue-50 rounded-2xl border border-blue-100 p-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">Application Process</h2>
                        <div className="flex flex-col md:flex-row gap-4 justify-between relative">
                            <div className="absolute top-4 left-0 right-0 h-0.5 bg-blue-200 hidden md:block" />

                            {[
                                { step: "1", title: "Submit", desc: "Resume & Info" },
                                { step: "2", title: "Assessment", desc: "Online Test" },
                                { step: "3", title: "Interview", desc: "Technical Round" },
                                { step: "4", title: "Offer", desc: "Welcome!" },
                            ].map((item, i) => (
                                <div key={i} className="relative z-10 flex flex-col items-center text-center bg-transparent">
                                    <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-md mb-3 border-4 border-white">
                                        {item.step}
                                    </div>
                                    <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                                    <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="mt-12 text-center pb-12">
                    <Button size="lg" onClick={handleApply} className="h-14 px-10 text-lg bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-transform hover:scale-105">
                        Apply Now <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>

            </main>

            <CandidateFooter />
        </div>
    );
}
