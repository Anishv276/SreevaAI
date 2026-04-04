"use client";

import { useState } from "react";
import { PortalHeader } from "@/components/careers/portal-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, FileText, Video, PlayCircle, XCircle, AlertCircle, Loader2, Sparkles, Mail, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function getStatusConfig(status: string) {
    const configs: Record<string, { color: string; bgColor: string; icon: any; label: string }> = {
        "Pending": { color: "text-yellow-700", bgColor: "bg-yellow-50", icon: Clock, label: "Pending Review" },
        "Shortlisted": { color: "text-green-700", bgColor: "bg-green-50", icon: CheckCircle2, label: "Shortlisted" },
        "ACCEPTED": { color: "text-green-700", bgColor: "bg-green-50", icon: CheckCircle2, label: "Shortlisted" },
        "Rejected": { color: "text-red-700", bgColor: "bg-red-50", icon: XCircle, label: "Rejected" },
        "COMPLETED": { color: "text-indigo-700", bgColor: "bg-indigo-50", icon: CheckCircle2, label: "Completed" },
    };
    return configs[status] || configs["Pending"];
}

function TimelineStep({ title, description, status, timestamp, action }: {
    title: string;
    description: string;
    status: "completed" | "current" | "upcoming";
    timestamp?: string;
    action?: { label: string; href?: string; onClick?: () => void; token?: string };
}) {
    return (
        <div className="relative">
            <div className={cn(
                "absolute -left-8 top-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center",
                status === "completed" ? "bg-green-100 text-green-600" :
                status === "current" ? "bg-blue-100 text-blue-600 ring-2 ring-blue-500" :
                "bg-gray-100 text-gray-400"
            )}>
                {status === "completed" ? <CheckCircle2 className="h-4 w-4" /> :
                 status === "current" ? <PlayCircle className="h-3 w-3" /> :
                 <Clock className="h-3 w-3" />}
            </div>
            <div className={cn(status === "upcoming" && "opacity-50")}>
                <h4 className={cn("font-medium", status === "current" ? "text-blue-600" : "text-gray-900")}>
                    {title}
                </h4>
                <p className="text-sm text-gray-500">{description}</p>
                {timestamp && <span className="text-xs text-gray-400 mt-1 block">{timestamp}</span>}
                {action && status === "current" && (
                    <div className="mt-3">
                        <Button size="sm" asChild className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20">
                            <a href={action.href || "#"} onClick={action.onClick}>
                                <PlayCircle className="h-4 w-4" /> {action.label}
                            </a>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CandidateDashboard() {
    const [email, setEmail] = useState("");
    const [applications, setApplications] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [searched, setSearched] = useState(false);

    const fetchApplications = async () => {
        if (!email || !email.includes("@")) {
            setError("Please enter a valid email address");
            return;
        }
        
        setLoading(true);
        setError("");
        
        try {
            const res = await fetch(`/api/candidates/status?email=${encodeURIComponent(email)}`);
            if (res.ok) {
                const data = await res.json();
                setApplications(data);
                setSearched(true);
            } else {
                const err = await res.json();
                setError(err.error || "Failed to fetch applications");
            }
        } catch (e) {
            setError("Failed to fetch applications");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <PortalHeader />

            <main className="container mx-auto px-4 py-8 max-w-5xl space-y-8 animate-in-fade">
                {/* Search Section */}
                {!searched && (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                        <div className="h-20 w-20 rounded-3xl bg-indigo-50 flex items-center justify-center">
                            <Mail className="h-10 w-10 text-indigo-600" />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-bold text-gray-900">Track Your Application</h1>
                            <p className="text-gray-500 mt-2">Enter your email to check your application status</p>
                        </div>
                        <div className="flex gap-3 w-full max-w-md">
                            <Input
                                type="email"
                                placeholder="Enter your email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && fetchApplications()}
                                className="h-12 rounded-xl border-gray-200"
                            />
                            <Button
                                onClick={fetchApplications}
                                disabled={loading}
                                className="h-12 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700"
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                            </Button>
                        </div>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                    </div>
                )}

                {/* Results Section */}
                {searched && (
                    <>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold">Applications for {email}</h1>
                                <p className="text-gray-500">{applications.length} application(s) found</p>
                            </div>
                            <Button variant="outline" onClick={() => { setSearched(false); setApplications([]); setEmail(""); }}>
                                Search Different Email
                            </Button>
                        </div>

                        {applications.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
                                <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="h-8 w-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">No Applications Found</h3>
                                <p className="text-gray-500 mt-2">No applications found for this email address.</p>
                                <Link href="/careers">
                                    <Button className="mt-4">Browse Open Positions</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {applications.map((app) => {
                                    const statusConfig = getStatusConfig(app.status);
                                    const StatusIcon = statusConfig.icon;
                                    
                                    return (
                                        <div key={app.id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                                            <div className="p-6 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                <div>
                                                    <h2 className="text-xl font-bold">{app.drive?.title || "Unknown Position"}</h2>
                                                    <p className="text-gray-500">
                                                        {app.drive?.department} • {app.drive?.workMode || "Remote"} • 
                                                        Applied on {new Date(app.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium", statusConfig.color, statusConfig.bgColor)}>
                                                    <StatusIcon className="h-4 w-4" /> {statusConfig.label}
                                                </div>
                                            </div>

                                            <div className="p-6 grid gap-8 lg:grid-cols-3">
                                                {/* Timeline */}
                                                <div className="lg:col-span-2 space-y-6 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-gray-100">
                                                    <div className="pl-8 space-y-8">
                                                        <TimelineStep
                                                            title="Application Submitted"
                                                            description="Your application was received and is under review."
                                                            status="completed"
                                                            timestamp={new Date(app.createdAt).toLocaleDateString()}
                                                        />

                                                        <TimelineStep
                                                            title="Resume Screening"
                                                            description={
                                                                app.status === "Pending" ? "Your resume is being screened by AI." :
                                                                app.status === "Shortlisted" || app.status === "ACCEPTED" ? "Your profile matches our requirements." :
                                                                app.status === "Rejected" ? "Unfortunately, your profile didn't match the requirements." :
                                                                "Screening in progress."
                                                            }
                                                            status={
                                                                app.status === "Rejected" ? "completed" :
                                                                app.status === "Shortlisted" || app.status === "ACCEPTED" ? "completed" :
                                                                "current"
                                                            }
                                                        />

                                                        {app.interview && (
                                                            <TimelineStep
                                                                title="AI Voice Interview"
                                                                description={
                                                                    app.interview.status === "PENDING" ? "Complete your AI voice interview to proceed." :
                                                                    app.interview.status === "IN_PROGRESS" ? "Your interview is currently in progress." :
                                                                    app.interview.status === "COMPLETED" ? "Your interview has been completed." :
                                                                    "Interview stage."
                                                                }
                                                                status={
                                                                    app.interview.status === "COMPLETED" ? "completed" :
                                                                    app.interview.status === "IN_PROGRESS" ? "current" :
                                                                    app.interview.status === "PENDING" && app.interview.canStart ? "current" :
                                                                    "upcoming"
                                                                }
                                                                action={
                                                                    app.interview.status === "PENDING" && app.interview.canStart
                                                                        ? {
                                                                            label: "Start Interview",
                                                                            href: `/careers/interview/${app.id}?token=${app.interview.token}`
                                                                        }
                                                                        : undefined
                                                                }
                                                            />
                                                        )}

                                                        {!app.interview && (app.status === "Shortlisted" || app.status === "ACCEPTED") && (
                                                            <TimelineStep
                                                                title="AI Voice Interview"
                                                                description="Your interview link is being prepared. You'll receive an email shortly."
                                                                status="current"
                                                            />
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="space-y-6">
                                                    {app.score !== null && app.score !== undefined && (
                                                        <div className="bg-gray-50 p-4 rounded-xl">
                                                            <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider text-gray-500">AI Score</h4>
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn(
                                                                    "text-2xl font-black",
                                                                    app.score >= 80 ? "text-green-600" : app.score >= 50 ? "text-orange-600" : "text-red-500"
                                                                )}>
                                                                    {app.score}
                                                                </div>
                                                                <span className="text-sm text-gray-400">/100</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="bg-gray-50 p-4 rounded-xl">
                                                        <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider text-gray-500">Next Steps</h4>
                                                        <ul className="space-y-2 text-sm text-gray-600">
                                                            {app.status === "Pending" && (
                                                                <li className="flex items-start gap-2">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-1.5" />
                                                                    Wait for AI screening results.
                                                                </li>
                                                            )}
                                                            {app.interview?.status === "PENDING" && app.interview?.canStart && (
                                                                <li className="flex items-start gap-2">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5" />
                                                                    Complete your AI voice interview.
                                                                </li>
                                                            )}
                                                            {app.status === "Rejected" && (
                                                                <li className="flex items-start gap-2">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 mt-1.5" />
                                                                    This application has been closed.
                                                                </li>
                                                            )}
                                                        </ul>
                                                    </div>

                                                    <div className="bg-gray-50 p-4 rounded-xl">
                                                        <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider text-gray-500">Support</h4>
                                                        <p className="text-sm text-gray-600 mb-2">Need help with your application?</p>
                                                        <Button variant="link" className="p-0 h-auto text-blue-600">Contact HR</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
