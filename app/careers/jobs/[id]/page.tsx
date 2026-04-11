"use client";

import { useEffect, useState, use } from "react";
import { JobDetailsView } from "@/components/careers/job-details-view";
import { PortalHeader } from "@/components/careers/portal-header";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/drives/${id}`, { cache: "no-store" })
            .then(async res => {
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error + (data.details ? `: ${data.details}` : "") || "Failed to load job details");
                }
                return data;
            })
            .then(data => setJob(data))
            .catch(err => {
                console.error(err);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="min-h-screen bg-[#FDFCFB]">
            <PortalHeader />
            <div className="container mx-auto px-4 py-12 max-w-7xl animate-pulse">
                <div className="flex flex-col lg:flex-row gap-12">
                    <div className="flex-1 space-y-8">
                        <div className="h-10 w-64 bg-gray-100 rounded-2xl" />
                        <div className="h-[400px] bg-gray-50 rounded-[2.5rem]" />
                    </div>
                    <div className="w-full lg:w-[400px] h-[600px] bg-gray-100 rounded-[2.5rem]" />
                </div>
            </div>
        </div>
    );

    if (error || !job) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center bg-white p-12 rounded-[2.5rem] shadow-xl border border-gray-100 max-w-md w-full">
                    <div className="h-20 w-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mx-auto mb-6">
                        <AlertCircle className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-4">{error === "Drive not found" ? "Job Not Found" : "Access Restricted"}</h1>
                    <p className="text-gray-500 font-medium mb-10 leading-relaxed">
                        {error || "We couldn't find the job you're looking for. It might have been closed or removed."}
                    </p>
                    <Link href="/careers">
                        <Button className="h-14 w-full rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-orange-500/20">
                            Back to All Jobs
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return <JobDetailsView job={job} />;
}
