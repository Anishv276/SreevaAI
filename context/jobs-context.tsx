"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Define the Job type
export type Job = {
    id: string;
    title: string;
    department: string;
    applicants: number;
    status: string;
    daysLeft: number;
    description?: string;
    salary?: string;
    type?: string;
    experience?: string;
    responsibilities?: string;
    requirements?: string;
    skills?: string;
    workMode?: string;
    registrationFields?: string;
    slug?: string;
    role?: string;
    deadline?: string;
    createdAt: string;
};

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface JobsContextType {
    jobs: Job[];
    pagination: Pagination;
    addJob: (job: Omit<Job, "id" | "applicants" | "status" | "daysLeft" | "createdAt">) => Promise<Job>;
    deleteJob: (id: string) => Promise<void>;
    fetchJobs: (page?: number, limit?: number, search?: string, status?: string, type?: string, startDate?: string, endDate?: string) => Promise<void>;
    toggleDriveStatus: (id: string, newStatus: "ACTIVE" | "CLOSED" | "DISABLED") => Promise<void>;
    updateJob: (id: string, data: any) => Promise<Job>;
    bulkDeleteJobs: (ids: string[]) => Promise<void>;
}

const JobsContext = createContext<JobsContextType | undefined>(undefined);

export function JobsProvider({ children }: { children: React.ReactNode }) {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [pagination, setPagination] = useState<Pagination>({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0
    });
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const orgIdFromUrl = searchParams.get("orgId");
    const isAdminRoute = pathname.startsWith("/admin");
    const isCareersRoute = pathname.startsWith("/careers");
    const hasLoadedOnceRef = useRef({ admin: false, careers: false });
    const inFlightRef = useRef<Promise<void> | null>(null);

    const fetchJobs = async (page: number = 1, limit: number = 10, search: string = "", status: string = "all", type: string = "all", startDate: string = "", endDate: string = "") => {
        if (inFlightRef.current) {
            await inFlightRef.current;
            return;
        }

        const requestPromise = (async () => {
        try {
            let url = `/api/drives?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}&type=${type}&startDate=${startDate}&endDate=${endDate}`;
            if (orgIdFromUrl) {
                url += `&orgId=${orgIdFromUrl}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const result = await res.json();
                const { drives, pagination: pagData } = result;
                setJobs(drives);
                setPagination(pagData);
                return;
            }

            if (res.status === 401 || res.status === 403) {
                setJobs([]);
                return;
            } else {
                console.error("Failed to fetch jobs:", res.status, res.statusText);
                setJobs([]);
            }
        } catch (error) {
            console.error("Failed to fetch jobs:", error);
            setJobs([]);
        }
        })();

        inFlightRef.current = requestPromise;

        try {
            await requestPromise;
        } finally {
            inFlightRef.current = null;
        }
    };

    // Load data once per section (admin/careers), no re-fetch per sub-route click
    useEffect(() => {
        if (isAdminRoute && !hasLoadedOnceRef.current.admin) {
            hasLoadedOnceRef.current.admin = true;
            fetchJobs().catch(() => undefined);
            return;
        }

        if (isCareersRoute && !hasLoadedOnceRef.current.careers) {
            hasLoadedOnceRef.current.careers = true;
            fetchJobs().catch(() => undefined);
        }
    }, [isAdminRoute, isCareersRoute]);

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

    const deleteJob = async (id: string) => {
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

    const toggleDriveStatus = async (id: string, newStatus: "ACTIVE" | "CLOSED" | "DISABLED") => {
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

    const updateJob = async (id: string, data: any): Promise<Job> => {
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
                // Log exact field errors so we can debug validation failures
                console.error("[updateJob] Validation details:", JSON.stringify(errorData.details, null, 2));
                const error = new Error(errorData.error || "Failed to update job") as any;
                error.details = errorData.details;
                throw error;
            }
        } catch (error) {
            console.error("Failed to update job:", error);
            throw error;
        }
    };

    const bulkDeleteJobs = async (ids: string[]) => {
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
        <JobsContext.Provider value={{ jobs, pagination, addJob, deleteJob, fetchJobs, toggleDriveStatus, updateJob, bulkDeleteJobs }}>
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
