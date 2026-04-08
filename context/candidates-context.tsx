"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
    education?: any[];
    experience_list?: any[];
    certifications?: any[];
    passportUrl?: string;
};

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface CandidatesContextType {
    candidates: Candidate[];
    pagination: Pagination;
    isLoading: boolean;
    error: string | null;
    addCandidate: (candidate: Omit<Candidate, "id" | "date" | "status" | "score">) => Promise<void>;
    fetchCandidates: (page?: number, limit?: number, driveId?: string, status?: string, startDate?: string, endDate?: string, search?: string) => Promise<void>;
    clearError: () => void;
    bulkDeleteCandidates: (ids: string[]) => Promise<void>;
}

const CandidatesContext = createContext<CandidatesContextType | undefined>(undefined);

const DEFAULT_LIMIT = 10;
const FETCH_REUSE_WINDOW_MS = 4000;
const STREAM_REFRESH_DEBOUNCE_MS = 1200;

export function CandidatesProvider({ children }: { children: React.ReactNode }) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<Pagination>({
        total: 0,
        page: 1,
        limit: DEFAULT_LIMIT,
        totalPages: 0
    });

    const [isHydrated, setIsHydrated] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const orgIdFromUrl = searchParams.get("orgId");
    const isCandidatesRoute = pathname.startsWith("/admin/candidates");

    const eventSourceRef = useRef<EventSource | null>(null);
    const paginationRef = useRef<Pagination>(pagination);
    const refreshTimerRef = useRef<number | null>(null);
    const hasFetchedAdminDataRef = useRef(false);
    const lastFetchRef = useRef<{ key: string; at: number } | null>(null);
    const inFlightRequestsRef = useRef<Map<string, Promise<void>>>(new Map());

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        paginationRef.current = pagination;
    }, [pagination]);

    const buildFetchKey = (
        page: number,
        limit: number,
        driveId?: string,
        status?: string,
        startDate?: string,
        endDate?: string,
        search?: string
    ) => {
        return [
            page,
            limit,
            driveId || "all",
            status || "all",
            startDate || "none",
            endDate || "none",
            search || ""
        ].join("|");
    };

    const fetchCandidatesInternal = useCallback(async (
        page: number = 1,
        limit: number = DEFAULT_LIMIT,
        driveId?: string,
        status?: string,
        startDate?: string,
        endDate?: string,
        search?: string,
        options?: { force?: boolean; background?: boolean }
    ) => {
        const key = buildFetchKey(page, limit, driveId, status, startDate, endDate, search);
        const now = Date.now();

        const inFlight = inFlightRequestsRef.current.get(key);
        if (inFlight) {
            await inFlight;
            return;
        }

        const lastFetch = lastFetchRef.current;
        const canReuseRecentFetch =
            !options?.force &&
            lastFetch?.key === key &&
            now - lastFetch.at < FETCH_REUSE_WINDOW_MS &&
            hasFetchedAdminDataRef.current;

        if (canReuseRecentFetch) {
            return;
        }

        const fetchWithRetry = async (url: string, retries = 3, backoff = 1000): Promise<Response> => {
            try {
                const res = await fetch(url);
                if (!res.ok && retries > 0 && (res.status >= 500 || res.status === 429)) {
                    await new Promise(r => setTimeout(r, backoff));
                    return fetchWithRetry(url, retries - 1, backoff * 2);
                }
                return res;
            } catch (err) {
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, backoff));
                    return fetchWithRetry(url, retries - 1, backoff * 2);
                }
                throw err;
            }
        };

        const requestPromise = (async () => {
            if (!options?.background) {
                setIsLoading(true);
                setError(null);
            }

            try {
                const params = new URLSearchParams({
                    page: String(page),
                    limit: String(limit),
                });

                if (orgIdFromUrl) {
                    params.set("orgId", orgIdFromUrl);
                }

                if (driveId && driveId !== "all") {
                    params.set("driveId", driveId);
                }
                if (status && status !== "all") {
                    params.set("status", status);
                }
                if (startDate) {
                    params.set("startDate", startDate);
                }
                if (endDate) {
                    params.set("endDate", endDate);
                }
                if (search && search.trim()) {
                    params.set("search", search.trim());
                }

                const res = await fetchWithRetry(`/api/candidates?${params.toString()}`);
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setError(data.error || "Failed to load candidates. Partial recovery active.");
                    return;
                }

                const result = await res.json();
                const { candidates: rawCandidates, pagination: pagData } = result;

                const mappedCandidates = Array.isArray(rawCandidates)
                    ? rawCandidates.map((c: any) => ({
                        id: c.id.toString(),
                        name: c.name || c.fullName || "Unknown Candidate",
                        email: c.email || "",
                        phone: c.phone || "",
                        location: c.location || "-",
                        role: c.role || "Unknown Role",
                        driveId: c.driveId?.toString(),
                        status: c.status,
                        interviewStatus: c.interviewStatus,
                        score: c.score || 0,
                        date: c.date,
                        resumeUrl: c.resumeUrl,
                        experienceYears: c.experienceYears,
                        relevantYears: c.relevantYears
                    }))
                    : [];

                setCandidates(mappedCandidates);
                if (pagData) {
                    setPagination({
                        total: Number(pagData.total ?? 0),
                        page: Number(pagData.page ?? page),
                        limit: Number(pagData.limit ?? limit),
                        totalPages: Number(pagData.totalPages ?? 0),
                    });
                }

                hasFetchedAdminDataRef.current = true;
                lastFetchRef.current = { key, at: Date.now() };
            } catch (error: any) {
                console.error("Failed to fetch candidates:", error);
                setError(error.message || "An unexpected error occurred during data synchronization.");
            } finally {
                if (!options?.background) {
                    setIsLoading(false);
                }
            }
        })();

        inFlightRequestsRef.current.set(key, requestPromise);

        try {
            await requestPromise;
        } finally {
            inFlightRequestsRef.current.delete(key);
        }
    }, []);

    const fetchCandidates = useCallback(async (
        page: number = 1,
        limit: number = DEFAULT_LIMIT,
        driveId?: string,
        status?: string,
        startDate?: string,
        endDate?: string,
        search?: string
    ) => {
        await fetchCandidatesInternal(page, limit, driveId, status, startDate, endDate, search);
    }, [fetchCandidatesInternal]);

    const scheduleStreamRefresh = useCallback(() => {
        if (refreshTimerRef.current !== null) {
            return;
        }

        refreshTimerRef.current = window.setTimeout(() => {
            refreshTimerRef.current = null;

            const current = paginationRef.current;
            void fetchCandidatesInternal(
                current.page,
                current.limit,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                { force: true, background: true }
            );
        }, STREAM_REFRESH_DEBOUNCE_MS);
    }, [fetchCandidatesInternal]);

    // REAL-TIME ARCHITECTURE: Establish stable stream only for candidates route
    useEffect(() => {
        if (!isHydrated || !isCandidatesRoute) {
            return;
        }

        // PERSISTENT STREAM: Don't recreate if already live
        if (eventSourceRef.current) {
            return;
        }

        const eventSource = new EventSource("/api/stream");
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event: MessageEvent<string>) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "NEW_APPLICATIONS" || data.type === "UPDATED_APPLICATIONS") {
                    // Debounced, non-blocking refresh
                    scheduleStreamRefresh();
                }
            } catch {
                // Ignore transient parsing errors
            }
        };

        eventSource.onerror = () => {
            // Connection lost - SSE will auto-retry
        };

        return () => {
            // Secure cleanup on unmount
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (refreshTimerRef.current !== null) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [isHydrated, isCandidatesRoute, fetchCandidatesInternal, scheduleStreamRefresh]);

    useEffect(() => {
        if (isCandidatesRoute) {
            return;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        if (refreshTimerRef.current !== null) {
            window.clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }, [isCandidatesRoute]);

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (refreshTimerRef.current !== null) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
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

            // Refetch to ensure we have the correct paginated state
            const current = paginationRef.current;
            await fetchCandidatesInternal(current.page, current.limit, undefined, undefined, undefined, undefined, undefined, {
                force: true,
            });
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
                // Refetch to ensure we have the correct paginated state after deletion
                const current = paginationRef.current;
                await fetchCandidatesInternal(current.page, current.limit, undefined, undefined, undefined, undefined, undefined, {
                    force: true,
                });
            } else {
                throw new Error("Failed to bulk delete candidates");
            }
        } catch (error) {
            console.error("Error bulk deleting candidates:", error);
            throw error;
        }
    };

    const clearError = useCallback(() => setError(null), []);

    return (
        <CandidatesContext.Provider value={{ candidates, pagination, isLoading, error, addCandidate, fetchCandidates, bulkDeleteCandidates, clearError }}>
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
