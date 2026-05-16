"use client";

import { CandidateRatingForm } from "@/components/careers/interview/CandidateRatingForm";

export default function RatingPreviewPage() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#ffedd5_40%,_#f8fafc_100%)] flex items-center justify-center py-10">
            <CandidateRatingForm
                mode="preview"
                title="Candidate Rating"
                subtitle="Preview the new post-interview feedback page."
            />
        </div>
    );
}
