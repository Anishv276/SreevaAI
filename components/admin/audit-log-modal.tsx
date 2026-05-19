"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
    AlertCircle, Clock, Eye, ShieldAlert, 
    Monitor, ExternalLink, Calendar, 
    Camera, ChevronRight, Hash, X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProctoringEvent {
    eventType: string;
    severity?: string;
    reason?: string;
    durationSeconds?: number;
    metadata?: Record<string, unknown>;
    timestamp?: number;
}

interface AuditLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidateName: string;
    events: ProctoringEvent[];
    recordingUrl?: string;
    recordingMimeType?: string;
    snapshots: string[];
    interviewStartedAt?: string | Date;
}

function inferVideoMimeType(url: string, mimeType?: string): string {
    const explicit = String(mimeType || "").trim().toLowerCase();
    if (explicit === "video/webm" || explicit === "video/mp4") return explicit;
    const normalized = String(url || "").toLowerCase();
    if (normalized.includes(".mp4")) return "video/mp4";
    return "video/webm";
}

const EVENT_LABELS: Record<string, string> = {
    face_absence: "Face Absence",
    multiple_faces: "Multiple Faces",
    identity_mismatch: "Identity Mismatch",
    tab_switch: "Tab Switch",
    connection_lost: "Connection Lost",
    camera_disabled: "Camera Disabled",
    microphone_disabled: "Microphone Disabled"
};

export function AuditLogModal({ 
    isOpen, 
    onClose, 
    candidateName, 
    events = [], 
    recordingUrl = "",
    recordingMimeType = "",
    snapshots = [], 
    interviewStartedAt 
}: AuditLogModalProps) {
    const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
    const [selectedOccurrence, setSelectedOccurrence] = useState(0);

    const occurrenceListRef = useRef<HTMLDivElement>(null);
    const recordingRef = useRef<HTMLVideoElement>(null);
    const pendingSeekRef = useRef<number | null>(null);
    const resolvedRecordingMimeType = inferVideoMimeType(recordingUrl, recordingMimeType);

    // Auto-scroll to selected occurrence
    useEffect(() => {
        if (occurrenceListRef.current) {
            const activeItem = occurrenceListRef.current.querySelector('[data-active="true"]');
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [selectedOccurrence]);

    // Group events by type
    const groupedEvents = useMemo(() => {
        const groups: Record<string, {
            type: string;
            label: string;
            count: number;
            timestamps: number[];
            severity: string;
            events: ProctoringEvent[];
        }> = {};

        events.forEach((ev, idx) => {
            const label = EVENT_LABELS[ev.eventType] || ev.eventType;
            if (!groups[ev.eventType]) {
                groups[ev.eventType] = {
                    type: ev.eventType,
                    label,
                    count: 0,
                    timestamps: [],
                    severity: ev.severity || "low",
                    events: []
                };
            }
            groups[ev.eventType].count++;
            if (ev.timestamp) groups[ev.eventType].timestamps.push(ev.timestamp);
            groups[ev.eventType].events.push({ ...ev, metadata: { ...(ev.metadata || {}), __index: idx } });
        });

        return Object.values(groups).sort((a, b) => b.count - a.count);
    }, [events]);

    const selectedGroup = useMemo(
        () => groupedEvents.find(group => group.type === selectedEvent) || groupedEvents[0] || null,
        [groupedEvents, selectedEvent]
    );

    const selectedOccurrenceEvent = useMemo(() => {
        if (!selectedGroup || !selectedGroup.events.length) return null;
        return selectedGroup.events[Math.min(selectedOccurrence, selectedGroup.events.length - 1)] || null;
    }, [selectedGroup, selectedOccurrence]);

    const fallbackSnapshots = useMemo(() => snapshots.slice(0, 6), [snapshots]);

    useEffect(() => {
        setSelectedOccurrence(0);
    }, [selectedEvent]);

    const getOccurrenceOffsetSeconds = (timestamp?: number) => {
        if (!timestamp || !interviewStartedAt) return null;
        const start = new Date(interviewStartedAt).getTime();
        if (!Number.isFinite(start)) return null;
        const diffSec = Math.max(0, (timestamp - start) / 1000);
        return Number.isFinite(diffSec) ? diffSec : null;
    };

    const seekRecording = (seconds: number) => {
        const video = recordingRef.current;
        if (!video) return;

        const safeSeconds = Math.max(0, seconds);
        const trySeek = () => {
            try {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    video.currentTime = Math.min(safeSeconds, Math.max(0, video.duration - 0.05));
                } else {
                    video.currentTime = safeSeconds;
                }
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(() => {});
                }
            } catch {
                pendingSeekRef.current = safeSeconds;
            }
        };

        if (video.readyState >= 1) {
            trySeek();
        } else {
            pendingSeekRef.current = safeSeconds;
            video.load();
        }
    };

    const formatRelativeTime = (ts: number) => {
        if (!interviewStartedAt) return "N/A";
        const start = new Date(interviewStartedAt).getTime();
        const diffSec = Math.floor((ts - start) / 1000);
        if (diffSec < 0) return "Before start";
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')} into session`;
    };

    const formatAbsoluteTime = (ts: number) => {
        if (!ts) return "";
        try {
            return new Date(ts).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        } catch {
            return "";
        }
    };

    const handleRecordingLoadedMetadata = () => {
        if (pendingSeekRef.current == null || !recordingRef.current) return;
        const seconds = pendingSeekRef.current;
        pendingSeekRef.current = null;
        try {
            recordingRef.current.currentTime = seconds;
        } catch {
            // ignore seek timing errors on media load
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[1500px] h-[92vh] p-0 overflow-hidden bg-[#F8FAFF] border border-slate-200 shadow-[0_30px_100px_rgba(15,23,42,0.12)] rounded-[3rem] font-inter">
                <div className="flex flex-col h-full">
                    {/* Premium Header Area */}
                    <DialogHeader className="px-10 py-8 border-b border-slate-200/60 bg-white/40 backdrop-blur-2xl backdrop-blur-md">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-6">
                                <div className="h-16 w-16 rounded-[1.75rem] bg-gray-900 text-white flex items-center justify-center shadow-xl shadow-gray-900/10 rotate-3 transform transition-all hover:rotate-0">
                                    <ShieldAlert className="h-8 w-8 text-white/90" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <DialogTitle className="text-3xl font-black text-gray-900 tracking-tighter">Integrity Audit</DialogTitle>
                                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 shadow-sm">
                                            <div className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Secured Feed</span>
                                        </div>
                                    </div>
                                    <DialogDescription className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        Auditing session for <span className="text-gray-900 font-black tracking-tight">{candidateName}</span>
                                    </DialogDescription>
                                </div>
                            </div>

                            <div className="flex items-center gap-10">
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Total Signals</p>
                                    <p className="text-2xl font-black text-gray-900 tracking-tighter">{events.length}</p>
                                </div>
                                <div className="h-10 w-px bg-gray-200" />
                                <button 
                                    onClick={onClose}
                                    className="group flex items-center gap-3 px-6 py-3 rounded-2xl bg-gray-900 text-white hover:bg-orange-600 transition-all duration-300 shadow-xl shadow-gray-900/10 hover:shadow-orange-600/20 active:scale-95"
                                >
                                    <span className="text-xs font-black uppercase tracking-widest">Exit Audit</span>
                                    <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30">
                                        <X className="h-3 w-3" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Main Content Area */}
                    <div className="flex-1 flex min-h-0 overflow-hidden">
                        {/* Sidebar: Signals List */}
                        <div className="w-[360px] flex-none border-r border-slate-200/60 bg-[#F1F5FF]/40 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 overscroll-contain space-y-4 overscroll-contain">
                                <h4 className="px-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Signal Frequency</h4>
                                {groupedEvents.length === 0 ? (
                                    <div className="p-10 text-center space-y-3">
                                        <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto">
                                            <Monitor className="h-6 w-6" />
                                        </div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">No signals detected.</p>
                                    </div>
                                ) : (
                                    groupedEvents.map((group) => (
                                        <button
                                            key={group.type}
                                            onClick={() => {
                                                setSelectedEvent(group.type);
                                                setSelectedOccurrence(0);
                                            }}
                                            className={cn(
                                                "w-full p-5 rounded-3xl border-2 transition-all duration-300 text-left",
                                                selectedEvent === group.type 
                                                    ? "bg-white border-orange-300 shadow-xl shadow-orange-900/10 ring-1 ring-orange-100" 
                                                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-md"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <span className="text-[14px] font-black text-gray-900 tracking-tight">{group.label}</span>
                                                    <div className="flex items-center gap-2">
                                                        <div className={cn(
                                                            "h-1.5 w-1.5 rounded-full",
                                                            group.severity === 'high' ? "bg-rose-500" : "bg-amber-500"
                                                        )} />
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{group.severity} risk</span>
                                                    </div>
                                                </div>
                                                <div className="h-10 w-10 rounded-2xl border border-gray-200 bg-white text-sm font-black text-gray-900 flex items-center justify-center">
                                                    {group.count}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Main Detail View */}
                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
                            {!selectedGroup ? (
                                <div className="flex-1 flex flex-col items-center justify-center m-12 border-2 border-dashed border-gray-200 rounded-[3rem] bg-gray-50/30">
                                    <Eye className="h-10 w-10 text-gray-200 mb-4" />
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No signal selected</p>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-8 gap-6">
                                    {/* Detailed Header - Fixed */}
                                    <div className="flex-none p-6 rounded-[2.5rem] bg-white border border-slate-200 shadow-md shadow-slate-200/50 flex items-center gap-6">
                                        <div className={cn(
                                            "h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg",
                                            selectedGroup.severity === "high" ? "bg-rose-500 text-white" : "bg-amber-500 text-white"
                                        )}>
                                            <AlertCircle className="h-7 w-7" />
                                        </div>
                                        <div>
                                            <h5 className="text-[26px] font-black text-gray-900 tracking-tight">{selectedGroup.label}</h5>
                                            <p className="text-sm font-bold text-gray-500">Found {selectedGroup.count} identified frames.</p>
                                        </div>
                                    </div>

                                    {/* Workspace Area - Explicit Height Limit */}
                                    <div className="flex-1 grid grid-cols-[0.92fr_1.08fr] gap-6 min-h-0 items-stretch">
                                        {/* Occurrences Col */}
                                        <div className="flex flex-col h-full min-h-0 bg-white rounded-[3rem] overflow-hidden border border-slate-200 shadow-xl shadow-slate-200/50">
                                            <div className="p-7 pb-4 border-b border-gray-100">
                                                <h6 className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Occurrences</h6>
                                            </div>
                                            <div
                                                className="flex-1 min-h-0 overflow-y-scroll custom-scrollbar px-6 overscroll-contain pb-6 space-y-4"
                                                ref={occurrenceListRef}
                                                style={{ maxHeight: "calc(92vh - 380px)" }}
                                            >
                                                {selectedGroup.events.map((ev, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setSelectedOccurrence(i);
                                                            const offsetSeconds = getOccurrenceOffsetSeconds(ev.timestamp);
                                                            if (offsetSeconds != null) {
                                                                seekRecording(offsetSeconds);
                                                            }
                                                        }}
                                                        className={cn(
                                                            "w-full text-left p-4 rounded-[1.6rem] border transition-all min-h-[88px]",
                                                            i === selectedOccurrence ? "bg-white border-orange-400 border-2 shadow-xl shadow-orange-950/5 scale-[1.02]" : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-md shadow-sm"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className="text-[9px] font-black text-gray-400">FRAME #{i+1}</span>
                                                            <span className="text-[11px] font-bold text-orange-500">
                                                                {formatRelativeTime(ev.timestamp || 0)} 
                                                                <span className="ml-2 text-gray-400 font-medium">@ {formatAbsoluteTime(ev.timestamp || 0)}</span>
                                                            </span>
                                                        </div>
                                                        <p className="text-[13px] font-bold text-gray-900 leading-snug">{ev.reason || "High risk detection."}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Visual Evidence Col */}
                                        <div className="flex flex-col min-h-0 gap-5 overflow-hidden">
                                            <div className="flex-none rounded-[2.5rem] overflow-hidden border border-slate-200 bg-slate-950 shadow-2xl">
                                                <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
                                                    <div>
                                                        <h6 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Recording</h6>
                                                        <p className="text-xs font-medium text-white/40 mt-1">
                                                            Click any occurrence to jump playback to that exact moment.
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                                                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                                        LiveKit recording
                                                    </div>
                                                </div>
                                                <div className="aspect-video bg-black">
                                                    {recordingUrl ? (
                                                            <video
                                                                ref={recordingRef}
                                                                className="h-full w-full object-cover"
                                                                controls
                                                                playsInline
                                                                preload="metadata"
                                                                key={recordingUrl}
                                                                onLoadedMetadata={handleRecordingLoadedMetadata}
                                                            >
                                                                <source src={recordingUrl} type={resolvedRecordingMimeType} />
                                                            </video>
                                                    ) : (
                                                        <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-white/40">
                                                            <Camera className="h-10 w-10" />
                                                            <p className="text-xs font-bold uppercase tracking-widest">Recording unavailable</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {recordingUrl ? (
                                                        <div className="px-6 pb-4 pt-2 flex items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02]">
                                                            <p className="text-[10px] font-medium text-white/40">
                                                                If playback fails in this browser, open the recording directly.
                                                            </p>
                                                            <a
                                                                href={recordingUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/80 hover:bg-white/5"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                                Open recording
                                                            </a>
                                                        </div>
                                                    ) : null}
                                                    {!recordingUrl && fallbackSnapshots.length > 0 ? (
                                                        <div className="p-6 border-t border-white/10 bg-white/[0.02]">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">
                                                                Reference Frames
                                                            </p>
                                                            <div className="grid grid-cols-3 gap-3">
                                                                {fallbackSnapshots.map((url, index) => (
                                                                    <div
                                                                        key={url + index}
                                                                        className="aspect-video overflow-hidden rounded-2xl border border-white/20 bg-black/40"
                                                                    >
                                                                        <img
                                                                            src={url}
                                                                            className="h-full w-full object-cover"
                                                                            alt={`Reference frame ${index + 1}`}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>

                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

