"use client";
import { useJobs } from "@/context/jobs-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Calendar, Users, ChevronRight, Plus } from "lucide-react";
export function JobList() {
    const { jobs } = useJobs();
    const router = useRouter();
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 group">
                    <div className="h-8 w-1 bg-gray-900 rounded-full shadow-[0_0_8px_rgba(15,23,42,0.15)] transition-all duration-300 group-hover:h-10" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Active Jobs</h2>
                </div>
                <Link
                    href="/admin/jobs"
                    className="flex items-center gap-1 text-sm font-bold text-gray-700 hover:text-slate-950 transition-all hover:gap-2"
                >
                    View All <ChevronRight className="h-4 w-4" />
                </Link>
            </div>
            {/* Cards Grid */}
            {jobs.length === 0 ? (
                <Card className="p-12 border-dashed border-2 border-gray-200 bg-violet-50/60 flex flex-col items-center text-center gap-4 group hover:border-slate-300 transition-colors">
                    <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-gray-700 shadow-sm border border-gray-200 group-hover:scale-110 transition-transform duration-300">
                        <Briefcase className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-gray-900">No jobs yet</p>
                        <p className="text-sm text-gray-400 mt-1 max-w-[280px]">Ready to hire? Launch your first job.</p>
                    </div>
                    <Link href="/admin/create-job">
                        <Button className="bg-slate-950 hover:bg-gray-800 text-white font-bold rounded-xl px-6 shadow-lg shadow-slate-900/10 hover:shadow-md transition-all">
                            <Plus className="h-4 w-4 mr-2" /> Create Job
                        </Button>
                    </Link>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {jobs.slice(0, 3).map((job) => (
                        <div
                            key={job.id}
                            className="bg-white rounded-2xl border border-gray-200 p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)] hover:border-slate-300 transition-all duration-300 group flex flex-col justify-between h-full cursor-pointer relative overflow-hidden"
                            onClick={() => router.push(`/admin/candidates/job/${job.id}`)}
                        >
                            {/* Top Accent Line */}
                            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-slate-900 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div>
                                {/* Header: Title */}
                                <div className="flex justify-between items-start gap-4 mb-3">
                                    <h3 className="text-lg font-extrabold text-slate-950 group-hover:text-gray-700 transition-colors leading-tight line-clamp-2">
                                        {job.title}
                                    </h3>
                                </div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
                                    {job.role || job.title}
                                </p>
                            </div>
                            {/* Footer Section */}
                            <div className="mt-auto space-y-5">
                                {/* Date & Applicants Row */}
                                <div className="flex items-center justify-between border-t border-dashed border-gray-200 pt-4">
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                                        <Calendar className="h-3.5 w-3.5" />
                                        <span>Posted {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 border border-gray-200 text-gray-700">
                                        <Users className="h-3.5 w-3.5" />
                                        <span className="text-xs font-black">{job.applicants || 0} Applicants</span>
                                    </div>
                                </div>
                                {/* Action Button */}
                                <Button 
                                    className="w-full rounded-xl bg-slate-950 hover:bg-gray-800 text-white font-bold h-10 shadow-sm transition-all group-hover:shadow-md"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/admin/candidates/job/${job.id}`);
                                    }}
                                >
                                    View Candidates <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
