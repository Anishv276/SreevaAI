"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    BadgeCheck,
    Briefcase,
    CheckCircle2,
    Clock3,
    Loader2,
    Mail,
    Radio,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAuditTrailFromAiReport, type CandidateActivityEvent } from "@/lib/candidate-activity.shared";

type CandidateDetails = {
    fullName?: string;
    createdAt?: string;
    updatedAt?: string;
    aiReport?: unknown;
    interview?: {
        inviteSentAt?: string | null;
    } | null;
};

type Props = {
    open: boolean;
    candidateId: string | null;
    candidateName?: string;
    backHref?: string;
    onClose: () => void;
};

function colorForType(type: CandidateActivityEvent["type"]) {
    switch (type) {
        case "resume_screened":
            return "bg-orange-50 text-orange-600 border-orange-100";
        case "status_changed":
            return "bg-slate-50 text-slate-700 border-slate-200";
        case "email_sent":
            return "bg-emerald-50 text-emerald-700 border-emerald-100";
        case "email_failed":
            return "bg-rose-50 text-rose-700 border-rose-100";
        case "interview_invite_sent":
        case "interview_link_resent":
            return "bg-blue-50 text-blue-700 border-blue-100";
        case "bulk_action":
            return "bg-violet-50 text-violet-700 border-violet-100";
        default:
            return "bg-slate-50 text-slate-700 border-slate-200";
    }
}

function iconForType(type: CandidateActivityEvent["type"]) {
    switch (type) {
        case "resume_screened":
            return Activity;
        case "status_changed":
            return Briefcase;
        case "email_sent":
            return Mail;
        case "email_failed":
            return Mail;
        case "interview_invite_sent":
        case "interview_link_resent":
            return Radio;
        case "bulk_action":
            return BadgeCheck;
        default:
            return CheckCircle2;
    }
}

function formatTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;

    return date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Kolkata",
    });
}

export function CandidateActivitySidebar({ open, candidateId, candidateName, backHref, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [candidate, setCandidate] = useState<CandidateDetails | null>(null);

    useEffect(() => {
        if (!open || !candidateId) return;

        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/candidates/${candidateId}`);
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    throw new Error(data?.error || "Failed to load candidate activity");
                }
                if (!cancelled) setCandidate(data);
            } catch (err) {
                if (!cancelled) setError((err as Error).message || "Failed to load activity");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [open, candidateId]);

    const trail = useMemo(() => {
        if (!candidate) return [];

        const parsedTrail = getAuditTrailFromAiReport(candidate.aiReport);
        const fallback: CandidateActivityEvent[] = [];

        if (candidate.createdAt) {
            fallback.push({
                type: "resume_screened",
                label: "Candidate record created",
                details: "Resume uploaded into the system",
                timestamp: candidate.createdAt,
                source: "system",
            });
        }

        if (candidate.updatedAt && candidate.updatedAt !== candidate.createdAt) {
            fallback.push({
                type: "status_changed",
                label: "Candidate record updated",
                details: `Last update at ${formatTimestamp(candidate.updatedAt)}`,
                timestamp: candidate.updatedAt,
                source: "system",
            });
        }

        if (candidate.interview?.inviteSentAt) {
            fallback.push({
                type: "interview_invite_sent",
                label: "Interview link sent",
                details: `Invite sent at ${formatTimestamp(candidate.interview.inviteSentAt)}`,
                timestamp: candidate.interview.inviteSentAt,
                source: "system",
            });
        }

        const merged = [...parsedTrail, ...fallback].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const dedup = new Map<string, CandidateActivityEvent>();
        for (const item of merged) {
            const key = `${item.type}|${item.label}|${item.timestamp}`;
            if (!dedup.has(key)) dedup.set(key, item);
        }

        return Array.from(dedup.values());
    }, [candidate]);

    const candidateTitle = candidate?.fullName || candidateName || "Candidate";

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1000] font-sans">
            <button
                aria-label="Close activity panel"
                className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
                onClick={onClose}
            />

            <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-hidden border-l border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 shadow-[0_20px_80px_rgba(15,23,42,0.18)]">
                <div className="flex h-full flex-col">
                    <div className="border-b border-slate-200 bg-white/90 px-6 py-5 backdrop-blur">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                                    <Activity className="h-3.5 w-3.5 text-[#F97316]" />
                                    Activity Flow
                                </div>
                                <h2 className="mt-2 truncate text-2xl font-black tracking-tight text-slate-950">
                                    {candidateTitle}
                                </h2>
                                <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-500">
                                    Exact timestamps for status changes, emails, interview actions, and record updates.
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                {backHref ? (
                                    <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50">
                                        <a href={backHref}>Open profile</a>
                                    </Button>
                                ) : null}
                                <button
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                                    onClick={onClose}
                                    aria-label="Close activity panel"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        {loading ? (
                            <div className="flex h-full items-center justify-center">
                                <div className="text-center">
                                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-500" />
                                    <p className="mt-3 text-xs font-black uppercase tracking-[0.24em] text-slate-400">
                                        Loading activity...
                                    </p>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 shadow-sm">
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-500">
                                    Failed to load
                                </p>
                                <p className="mt-2 font-medium">{error}</p>
                            </div>
                        ) : trail.length === 0 ? (
                            <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
                                <Clock3 className="mx-auto h-10 w-10 text-slate-300" />
                                <p className="mt-3 text-base font-bold text-slate-900">No activity recorded yet</p>
                                <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                                    Once HR shortlists, rejects, sends email, or starts interviews, the flow will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {trail.map((item, index) => {
                                    const Icon = iconForType(item.type);
                                    const isLast = index === trail.length - 1;

                                    return (
                                        <div key={`${item.type}-${item.timestamp}-${index}`} className="flex gap-4">
                                            <div className="flex flex-col items-center pt-1">
                                                <div
                                                    className={cn(
                                                        "flex h-12 w-12 items-center justify-center rounded-full border shadow-sm",
                                                        colorForType(item.type)
                                                    )}
                                                >
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                {!isLast ? (
                                                    <div className="mt-2 h-full w-px flex-1 rounded-full bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />
                                                ) : null}
                                            </div>

                                            <div className="min-w-0 flex-1 pb-2">
                                                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <p className="text-base font-black leading-6 text-slate-950">
                                                            {item.label}
                                                        </p>
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                            {formatTimestamp(item.timestamp)}
                                                        </p>
                                                    </div>

                                                    {item.details ? (
                                                        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                                                            {item.details}
                                                        </p>
                                                    ) : null}

                                                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                        <span>{String(item.source || "system")}</span>
                                                        <span className="text-slate-300">-</span>
                                                        <span>{item.type.replace(/_/g, " ")}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </div>
    );
}
