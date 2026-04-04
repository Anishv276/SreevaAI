"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Candidate = {
    id: string;
    name: string;
    email: string;
    phone: string;
    location: string;
    role: string; // derived from Drive title
    driveId: string; // to link to specific drive
    status:
        | "Shortlisted"
        | "Interview Pending"
        | "Interview In Progress"
        | "Interview Completed"
        | "Rejected"
        | "Borderline"
        | "Under Review"
        | "Assessment"
        | "Interview"
        | "Applied";
    interviewStatus?: "Not Selected" | "Interview Pending" | "Interview In Progress" | "Interview Completed";
    score: number;
    date: string;
    experienceYears?: number;
    relevantYears?: number;
    resumeUrl?: string;
    resumeText?: string; // extracted text for AI scoring
    // Submission fields
    portfolio?: string;
    experience?: string;
    currentCompany?: string;
    currentCtc?: string;
    expectedCtc?: string;
    noticePeriod?: string;
    coverLetter?: string;
    structuredResume?: any;
};

interface CandidatesContextType {
    candidates: Candidate[];
    addCandidate: (candidate: Omit<Candidate, "id" | "date" | "status" | "score">) => Promise<void>;
    fetchCandidates: () => Promise<void>;
    bulkDeleteCandidates: (ids: string[]) => Promise<void>;
}

const CandidatesContext = createContext<CandidatesContextType | undefined>(undefined);

export function CandidatesProvider({ children }: { children: React.ReactNode }) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);

    const fetchCandidates = async () => {
        try {
            const res = await fetch("/api/candidates");
            if (res.ok) {
                const data = await res.json();
                // Map API data to Context structure if necessary
                const mappedCandidates = data.map((c: any) => ({
                    id: c.id.toString(),
                    name: c.name,
                    email: c.email,
                    phone: c.phone || "",
                    location: c.location || "",
                    role: c.role || "Unknown Role",
                    driveId: c.driveId?.toString(),
                    status: c.status,
                    interviewStatus: c.interviewStatus,
                    score: c.score || 0,
                    date: c.date,
                    resumeUrl: c.resumeUrl,
                    experienceYears: c.experienceYears,
                    relevantYears: c.relevantYears
                }));
                setCandidates(mappedCandidates);
            }
        } catch (error) {
            console.error("Failed to fetch candidates:", error);
        }
    };

    useEffect(() => {
        fetchCandidates();

        // SSE connection for real-time updates
        const eventSource = new EventSource("/api/stream");
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "NEW_APPLICATIONS" || data.type === "UPDATED_APPLICATIONS") {
                    fetchCandidates();
                }
            } catch (e) {
                // Invalid JSON, ignore
            }
        };

        eventSource.onerror = () => {
            // Connection lost, will auto-reconnect
        };

        return () => {
            eventSource.close();
        };
    }, []);

    const addCandidate = async (newCandidateData: Omit<Candidate, "id" | "date" | "status" | "score">) => {
        try {
            const response = await fetch("/api/candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newCandidateData,
                    fullName: newCandidateData.name,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || "Failed to create application";
                
                // Formulate detailed error message
                let detailMsg = "";
                if (errorData.details) {
                    if (typeof errorData.details === "object") {
                        detailMsg = "\n\nDetails:\n" + Object.entries(errorData.details)
                            .map(([field, msgs]) => `- ${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
                            .join("\n");
                    } else {
                        detailMsg = `\n\nDetails: ${errorData.details}`;
                    }
                }
                
                // Throw error with status code so frontend can handle duplicates specifically
                const error = new Error(errorMessage);
                (error as any).status = response.status;
                throw error;
            }

            const savedCandidate = await response.json();

            // Optimistically update or re-fetch
            const newCandidate: Candidate = {
                id: savedCandidate.id.toString(),
                ...newCandidateData,
                status: savedCandidate.status as any,
                score: savedCandidate.aiScore || 0,
                date: new Date(savedCandidate.createdAt).toLocaleDateString(),
            };

            setCandidates(prev => [newCandidate, ...prev]);
        } catch (error) {
            throw error;
        }
    };

    const bulkDeleteCandidates = async (ids: string[]) => {
        try {
            const response = await fetch("/api/candidates", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });

            if (response.ok) {
                setCandidates(prev => prev.filter(c => !ids.includes(c.id)));
            } else {
                throw new Error("Failed to bulk delete candidates");
            }
        } catch (error) {
            console.error("Error bulk deleting candidates:", error);
            throw error;
        }
    };

    return (
        <CandidatesContext.Provider value={{ candidates, addCandidate, fetchCandidates, bulkDeleteCandidates }}>
            {children}
        </CandidatesContext.Provider>
    );
}

export function useCandidates() {
    const context = useContext(CandidatesContext);
    if (context === undefined) {
        throw new Error("useCandidates must be used within a CandidatesProvider");
    }
    return context;
}
