import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { Job } from "@/context/jobs-context";

export function JobCard({ job }: { job: Job }) {
    // Show actual salary or a polite placeholder if not specified
    const salary = job.salary || "Competitive Salary";
    const type = job.type || "Full-time";
    
    // Instead of random, we can show "New" if posted in last 7 days
    const isNew = new Date(job.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

    return (
        <div className="group relative flex flex-col justify-between rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-500 hover:shadow-[0_30px_60px_rgba(249,115,22,0.1)] hover:-translate-y-2">
            {/* Decorative Top Accent */}
            <div className="absolute top-0 right-10 h-1 w-12 bg-[#F97316] rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="px-3 py-1 rounded-full bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-widest border border-orange-100">
                            {job.department || "TECH"}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {job.status === "CLOSED" ? (
                                <>
                                    <span className="text-[9px] font-black text-red-600 uppercase tracking-tighter">Application Closed</span>
                                    <div className="h-2 w-2 rounded-full bg-red-500" />
                                </>
                            ) : isNew && (
                                <>
                                    <span className="text-[9px] font-black text-green-600 uppercase tracking-tighter">New Posting</span>
                                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                </>
                            )}
                        </div>
                    </div>
                    
                    <h3 className="font-black text-2xl text-gray-900 group-hover:text-[#F97316] transition-colors leading-tight">
                        {job.title}
                    </h3>
                </div>

                <div className="space-y-4">
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400 font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {(job as any).workMode || "Remote"}
                        </div>
                        <div className="flex items-center gap-2 text-gray-900">
                            <Clock className="h-4 w-4 text-[#F97316]" />
                            {type}
                        </div>
                    </div>

                    <p className="text-gray-500 font-medium line-clamp-2 leading-relaxed text-[15px]">
                        {job.description || `Join our ${job.department} team as a ${job.title} and help us build the next generation of AI solutions.`}
                    </p>
                </div>
            </div>

            <div className="mt-10 pt-6 border-t border-gray-50 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Estimated Range</p>
                    <p className="text-gray-900 font-black tracking-tight">{salary}</p>
                </div>
                <Link href={`/careers/jobs/${job.id}`}>
                    <Button className="h-12 w-12 rounded-2xl bg-gray-50 text-gray-400 group-hover:bg-[#F97316] group-hover:text-white group-hover:shadow-[0_10px_20px_rgba(249,115,22,0.3)] transition-all duration-300" variant="ghost" size="icon">
                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </Button>
                </Link>
            </div>
        </div>
    );
}
