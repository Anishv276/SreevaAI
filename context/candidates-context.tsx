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
    fullName?: string;
    name: string;
    email: string;
    phone: string;
    location: string;
    role: string; // derived from Drive title
    driveId: string; // to link to specific drive
    status: string;
    interviewStatus?: string;
    score: number;
    screeningProgress?: number | null;
    screeningStage?: string | null;
    date: string;
    experienceYears?: number;
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
};
interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
type CandidateFetchParams = {
    page: number;
    limit: number;
    driveId?: string;
    resumeStatus?: string;
    interviewStatus?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: "default" | "score_desc" | "score_asc";
};
export interface CandidateStats {
    shortlisted: number;
    rejected: number;
    interviewRunning: number;
    interviewPending: number;
    interviewCompleted: number;
}
interface CandidatesContextType {
    candidates: Candidate[];
    pagination: Pagination;
    stats: CandidateStats;
    isLoading: boolean;
    error: string | null;
    addCandidate: (candidate: Omit<Candidate, "id" | "date" | "status" | "score">) => Promise<void>;
    fetchCandidates: (
        page?: number,
        limit?: number,
        driveId?: string,
        resumeStatus?: string,
        interviewStatus?: string,
        startDate?: string,
        endDate?: string,
        search?: string,
        sort?: "default" | "score_desc" | "score_asc",
        options?: { force?: boolean; background?: boolean }
    ) => Promise<void>;
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
    const [stats, setStats] = useState<CandidateStats>({
        shortlisted: 0,
        rejected: 0,
        interviewRunning: 0,
        interviewPending: 0,
        interviewCompleted: 0
    });
    const [isHydrated, setIsHydrated] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const orgIdFromUrl = searchParams.get("orgId");
    const isCandidatesRoute =
        pathname.startsWith("/admin/candidates") ||
        /^\/super-admin\/orgs\/[^/]+\/(candidates|view)$/.test(pathname);
    const eventSourceRef = useRef<EventSource | null>(null);
    const paginationRef = useRef<Pagination>(pagination);
    const refreshTimerRef = useRef<number | null>(null);
    const hasFetchedAdminDataRef = useRef(false);
    const lastFetchRef = useRef<{ key: string; at: number } | null>(null);
    const inFlightRequestsRef = useRef<Map<string, Promise<void>>>(new Map());
    const lastFetchParamsRef = useRef<CandidateFetchParams | null>(null);
    const fetchSequenceRef = useRef(0);
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
        resumeStatus?: string,
        interviewStatus?: string,
        startDate?: string,
        endDate?: string,
        search?: string,
        sort?: "default" | "score_desc" | "score_asc",
    ) => {
        return [
            page,
            limit,
            driveId || "all",
            resumeStatus || "all",
            interviewStatus || "all",
            startDate || "none",
            endDate || "none",
            search || "",
            sort || "default",
        ].join("|");
    };
    const fetchCandidatesInternal = useCallback(async (
        page: number = 1,
        limit: number = DEFAULT_LIMIT,
        driveId?: string,
        resumeStatus?: string,
        interviewStatus?: string,
        startDate?: string,
        endDate?: string,
        search?: string,
        sort: "default" | "score_desc" | "score_asc" = "default",
        options?: { force?: boolean; background?: boolean }
    ) => {
        const currentFetchParams: CandidateFetchParams = {
            page,
            limit,
            driveId,
            resumeStatus,
            interviewStatus,
            startDate,
            endDate,
            search,
            sort,
        };
        const key = buildFetchKey(page, limit, driveId, resumeStatus, interviewStatus, startDate, endDate, search, sort);
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
        const requestId = ++fetchSequenceRef.current;
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
                if (resumeStatus && resumeStatus !== "all") {
                    params.set("resumeStatus", resumeStatus);
                }
                if (interviewStatus && interviewStatus !== "all") {
                    params.set("interviewStatus", interviewStatus);
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
                if (sort !== "default") {
                    const [sortBy, sortDir] = sort.split("_");
                    params.set("sortBy", sortBy);
                    params.set("sortDir", sortDir);
                }
                const res = await fetchWithRetry(`/api/candidates?${params.toString()}`);
                if (!res.ok) {
                    if (requestId !== fetchSequenceRef.current) return;
                    const data = await res.json().catch(() => ({}));
                    setError(data.error || "Failed to load candidates. Partial recovery active.");
                    return;
                }
                const result = await res.json();
                const { candidates: rawCandidates, pagination: pagData, stats: statsData } = result;
                if (requestId !== fetchSequenceRef.current) {
                    return;
                }
                const mappedCandidates = Array.isArray(rawCandidates)
                    ? rawCandidates.map((c: any) => ({
                        id: c.id.toString(),
                        fullName: c.fullName || c.name || "Unknown Candidate",
                        name: c.fullName || c.name || "Unknown Candidate",
                        email: c.email || "",
                        phone: c.phone || "",
                        location: c.location || "-",
                        role: c.jobRole || c.jobrole || c.role || c.driveTitle || c.drivetitle || "Unknown Role",
                        driveId: c.driveId?.toString(),
                        status: c.status,
                        interviewStatus: c.interviewStatus,
                        score: c.score || 0,
                        screeningProgress: c.screeningProgress ?? null,
                        screeningStage: c.screeningStage ?? null,
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
                if (statsData) {
                    setStats(statsData);
                }
                hasFetchedAdminDataRef.current = true;
                lastFetchRef.current = { key, at: Date.now() };
                lastFetchParamsRef.current = currentFetchParams;
            } catch (error: any) {
                if (requestId !== fetchSequenceRef.current) {
                    return;
                }
                console.error("Failed to fetch candidates:", error);
                setError(error.message || "An unexpected error occurred during data synchronization.");
            } finally {
                if (!options?.background && requestId === fetchSequenceRef.current) {
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
        resumeStatus?: string,
        interviewStatus?: string,
        startDate?: string,
        endDate?: string,
        search?: string,
        sort?: "default" | "score_desc" | "score_asc",
        options?: { force?: boolean; background?: boolean }
    ) => {
        await fetchCandidatesInternal(page, limit, driveId, resumeStatus, interviewStatus, startDate, endDate, search, sort, options);
    }, [fetchCandidatesInternal]);
    const scheduleStreamRefresh = useCallback(() => {
        // Cancel any pending timer and restart — ensures the latest SSE event always
        // triggers a refresh, not just the first one in a burst.
        if (refreshTimerRef.current !== null) {
            window.clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        refreshTimerRef.current = window.setTimeout(() => {
            refreshTimerRef.current = null;
            const current = paginationRef.current;
            const lastParams = lastFetchParamsRef.current;
            void fetchCandidatesInternal(
                lastParams?.page ?? current.page,
                lastParams?.limit ?? current.limit,
                lastParams?.driveId,
                lastParams?.resumeStatus,
                lastParams?.interviewStatus,
                lastParams?.startDate,
                lastParams?.endDate,
                lastParams?.search,
                lastParams?.sort ?? "default",
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
                if (
                    hasFetchedAdminDataRef.current &&
                    (data.type === "NEW_APPLICATIONS" || data.type === "UPDATED_APPLICATIONS")
                ) {
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
        // Refresh immediately when user switches back to this tab
        const handleVisibility = () => {
            if (document.visibilityState === "visible" && hasFetchedAdminDataRef.current) {
                scheduleStreamRefresh();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
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
            const fullName =
                (newCandidateData as Candidate).name ||
                (newCandidateData as any).fullName ||
                "";
            const response = await fetch("/api/candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newCandidateData,
                    fullName,
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
                const error = new Error(detailMsg ? `${errorMessage}${detailMsg}` : errorMessage);
                (error as any).status = response.status;
                (error as any).details = errorData.details;
                throw error;
            }
            const savedCandidate = await response.json();
            // Refetch to ensure we have the correct paginated state
            const current = paginationRef.current;
            const lastParams = lastFetchParamsRef.current;
            await fetchCandidatesInternal(
                lastParams?.page ?? current.page,
                lastParams?.limit ?? current.limit,
                lastParams?.driveId,
                lastParams?.resumeStatus,
                lastParams?.interviewStatus,
                lastParams?.startDate,
                lastParams?.endDate,
                lastParams?.search,
                lastParams?.sort ?? "default",
                { force: true }
            );
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
                const lastParams = lastFetchParamsRef.current;
                await fetchCandidatesInternal(
                    lastParams?.page ?? current.page,
                    lastParams?.limit ?? current.limit,
                    lastParams?.driveId,
                    lastParams?.resumeStatus,
                    lastParams?.interviewStatus,
                    lastParams?.startDate,
                    lastParams?.endDate,
                    lastParams?.search,
                    lastParams?.sort ?? "default",
                    { force: true }
                );
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
        <CandidatesContext.Provider value={{
            candidates,
            pagination,
            stats,
            isLoading,
            error,
            addCandidate,
            fetchCandidates,
            bulkDeleteCandidates,
            clearError
        }}>
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
