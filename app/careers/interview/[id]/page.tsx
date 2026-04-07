"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { HardwareCheck } from "@/components/careers/interview/HardwareCheck";
import { InterviewSession } from "@/components/careers/interview/InterviewSession";
import { Loader2 } from "lucide-react";

function InterviewPageInner({ params }: { params: Promise<{ id: string }> }) {
    const { id: applicationId } = use(params);
    const searchParams = useSearchParams();
    const router = useRouter();
    const interviewToken = searchParams.get("token");

    const [stage, setStage] = useState<"check" | "connecting" | "interview">("check");
    const [candidateName, setCandidateName] = useState("Candidate");
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // LiveKit credentials
    const [lkToken, setLkToken] = useState<string | null>(null);
    const [lkUrl, setLkUrl] = useState<string | null>(null);

    // Fetch candidate name
    useEffect(() => {
        if (!applicationId) return;
        fetch(`/api/candidates/${applicationId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.fullName) setCandidateName(data.fullName);
            })
            .catch(() => {});
    }, [applicationId]);

    const handleHardwareCheckComplete = async () => {
        let currentToken = interviewToken;
        
        // For local development testing: if token is missing, use a bypass that the API will recognize
        if (!currentToken && process.env.NODE_ENV === "development") {
            currentToken = "dev-bypass";
        }

        if (!currentToken) {
            setError("Missing interview token. Please use the link provided in your email.");
            return;
        }

        setIsStarting(true);
        setError(null);
        setStage("connecting");

        try {
            // Fetch LiveKit token from our new API
            const response = await fetch(`/api/interview/${applicationId}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: currentToken }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to join interview room");
            }

            const { token, url } = await response.json();
            setLkToken(token);
            setLkUrl(url);
            
            // Try to go fullscreen
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (e) {
                console.warn("Fullscreen request failed:", e);
            }

            setStage("interview");
        } catch (err: any) {
            setError(err.message || "Failed to start interview. Please try again.");
            setStage("check");
            setIsStarting(false);
        }
    };

    if (stage === "check") {
        return (
            <HardwareCheck
                onComplete={handleHardwareCheckComplete}
                isStarting={isStarting}
                errorMessage={error}
                candidateName={candidateName}
                applicationId={applicationId}
            />
        );
    }

    if (stage === "connecting") {
        return (
            <div className="min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center gap-6">
                <div className="h-20 w-20 rounded-3xl bg-orange-50 flex items-center justify-center">
                    <Loader2 className="h-10 w-10 text-[#F97316] animate-spin" />
                </div>
                <div className="text-center space-y-2">
                    <p className="font-black text-gray-900 text-lg">Connecting to AI Interviewer...</p>
                    <p className="text-sm text-gray-400 font-medium">Setting up your secure interview session</p>
                </div>
            </div>
        );
    }

    if (stage === "interview" && lkToken && lkUrl) {
        return (
            <InterviewSession
                applicationId={applicationId}
                token={lkToken}
                url={lkUrl}
                candidateName={candidateName}
                onEnd={() => {
                    // Redirect to a thank you page or back to home
                    router.push("/careers/success");
                }}
            />
        );
    }

    return null;
}

export default function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-[#F97316] animate-spin" />
            </div>
        }>
            <InterviewPageInner params={params} />
        </Suspense>
    );
}
