"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
// import { activeDrivesData } from "@/lib/mock-data"; 

// Define the Job type
export type Job = {
    id: number;
    title: string;
    department: string;
    location: string;
    applicants: number;
    status: string;
    daysLeft: number;
    // Add other fields as needed for the full job description
    description?: string;
    salary?: string;
    type?: string;
    createdAt: string;
};

interface JobsContextType {
    jobs: Job[];
    addJob: (job: Omit<Job, "id" | "applicants" | "status" | "daysLeft" | "createdAt">) => Promise<Job>;
    deleteJob: (id: number) => Promise<void>;
    fetchJobs: () => Promise<void>;
    toggleDriveStatus: (id: number, newStatus: "ACTIVE" | "INACTIVE") => Promise<void>;
    updateJob: (id: number, data: any) => Promise<Job>;
    bulkDeleteJobs: (ids: number[]) => Promise<void>;
}

const JobsContext = createContext<JobsContextType | undefined>(undefined);

export function JobsProvider({ children }: { children: React.ReactNode }) {
    const [jobs, setJobs] = useState<Job[]>([]);

    const fetchJobs = async () => {
        try {
            const res = await fetch("/api/drives");
            if (res.ok) {
                const data = await res.json();
                setJobs(data);
            } else {
                throw new Error("Failed to fetch jobs");
            }
        } catch (error) {
            console.error("Failed to fetch jobs:", error);
            throw error;
        }
    };

    // Load initial data
    useEffect(() => {
        fetchJobs();
    }, []);

    const addJob = async (newJobData: Omit<Job, "id" | "applicants" | "status" | "daysLeft" | "createdAt">): Promise<Job> => {
        try {
            const res = await fetch("/api/drives", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newJobData),
            });

            if (res.ok) {
                const data = await res.json();
                fetchJobs(); // Refresh list
                return data;
            } else {
                const errorData = await res.json();
                const error = new Error(errorData.error || "Failed to add job") as any;
                error.details = errorData.details;
                throw error;
            }
        } catch (error) {
            console.error("Failed to add job:", error);
            throw error;
        }
    };

    const deleteJob = async (id: number) => {
        try {
            const res = await fetch(`/api/drives/${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                // Optimistic update or refetch
                setJobs((prev) => prev.filter((job) => job.id !== id));
            } else {
                throw new Error("Failed to delete drive");
            }
        } catch (error) {
            console.error("Failed to delete job:", error);
            throw error; // Re-throw so component can handle UI feedback
        }
    };

    const toggleDriveStatus = async (id: number, newStatus: "ACTIVE" | "INACTIVE") => {
        // Optimistic update
        setJobs((prev) =>
            prev.map((job) => (job.id === id ? { ...job, status: newStatus } : job))
        );
        try {
            await fetch(`/api/drives/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
        } catch (error) {
            console.error("Failed to toggle drive status:", error);
            fetchJobs(); // Revert on error
        }
    };

    const updateJob = async (id: number, data: any): Promise<Job> => {
        try {
            const res = await fetch(`/api/drives/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                const data = await res.json();
                fetchJobs(); // Refresh list
                return data;
            } else {
                const errorData = await res.json();
                const error = new Error(errorData.error || "Failed to update job") as any;
                error.details = errorData.details;
                throw error;
            }
        } catch (error) {
            console.error("Failed to update job:", error);
            throw error;
        }
    };

    const bulkDeleteJobs = async (ids: number[]) => {
        try {
            const res = await fetch("/api/drives", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });

            if (res.ok) {
                setJobs(prev => prev.filter(job => !ids.includes(job.id)));
            } else {
                throw new Error("Failed to bulk delete drives");
            }
        } catch (error) {
            console.error("Failed to bulk delete jobs:", error);
            throw error;
        }
    };

    return (
        <JobsContext.Provider value={{ jobs, addJob, deleteJob, fetchJobs, toggleDriveStatus, updateJob, bulkDeleteJobs }}>
            {children}
        </JobsContext.Provider>
    );
}

export function useJobs() {
    const context = useContext(JobsContext);
    if (context === undefined) {
        throw new Error("useJobs must be used within a JobsProvider");
    }
    return context;
}
