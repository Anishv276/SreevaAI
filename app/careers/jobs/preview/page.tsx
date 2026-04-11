"use client";

import { useEffect, useState } from "react";
import { JobDetailsView } from "@/components/careers/job-details-view";
import { PortalHeader } from "@/components/careers/portal-header";
import { Loader2 } from "lucide-react";

export default function JobPreviewPage() {
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadPreview = async () => {
            try {
                // 1. Get draft job from local storage
                const draftStr = localStorage.getItem("candidate_preview_data");
                if (!draftStr) {
                    setJob(null);
                    setLoading(false);
                    return;
                }
                const draft = JSON.parse(draftStr);

                // 2. Fetch real org info for brand consistency
                const orgRes = await fetch("/api/admin/organization");
                let org = {};
                if (orgRes.ok) {
                    org = await orgRes.json();
                }

                // 3. Merge data
                setJob({
                    ...draft,
                    organization: org,
                    applicants: 0,
                    status: "ACTIVE"
                });
            } catch (err) {
                console.error("Preview load failed:", err);
            } finally {
                setLoading(false);
            }
        };

        loadPreview();
    }, []);

    if (loading) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Generative Preview...</p>
        </div>
    );

    if (!job) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center gap-4">
            <div className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-600 text-[10px] font-black uppercase tracking-widest border border-orange-100">
                Session Invalid
            </div>
            <p className="text-gray-400 font-medium max-w-xs">Return to the creator dashboard and click preview again to refresh this view.</p>
        </div>
    );

    return <JobDetailsView job={job} isDraft={true} />;
}
