"use client";

import { useState, useMemo } from "react";
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
    Camera, ChevronRight, Hash
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
    snapshots: string[];
    interviewStartedAt?: string | Date;
}

const EVENT_LABELS: Record<string, string> = {
    face_absence: "Face Absence",
    multiple_faces: "Multiple Faces",
    gaze_violation: "Gaze off-screen",
    head_pose_violation: "Head Pose Deviation",
    identity_mismatch: "Identity Mismatch",
    audio_flag: "Background Audio",
    tab_switch: "Tab Switch",
    fullscreen_exit: "Fullscreen Exit",
    connection_lost: "Connection Lost",
    connection_restored: "Connection Restored",
    camera_disabled: "Camera Disabled",
    microphone_disabled: "Microphone Disabled"
};

export function AuditLogModal({ 
    isOpen, 
    onClose, 
    candidateName, 
    events = [], 
    snapshots = [], 
    interviewStartedAt 
}: AuditLogModalProps) {
    const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

    // Group events by type
    const groupedEvents = useMemo(() => {
        const groups: Record<string, {
            type: string;
            label: string;
            count: number;
            timestamps: number[];
            severity: string;
        }> = {};

        events.forEach(ev => {
            const label = EVENT_LABELS[ev.eventType] || ev.eventType;
            if (!groups[ev.eventType]) {
                groups[ev.eventType] = {
                    type: ev.eventType,
                    label,
                    count: 0,
                    timestamps: [],
                    severity: ev.severity || "low"
                };
            }
            groups[ev.eventType].count++;
            if (ev.timestamp) groups[ev.eventType].timestamps.push(ev.timestamp);
        });

        return Object.values(groups).sort((a, b) => b.count - a.count);
    }, [events]);

    const formatRelativeTime = (ts: number) => {
        if (!interviewStartedAt) return "N/A";
        const start = new Date(interviewStartedAt).getTime();
        const diffSec = Math.floor((ts - start) / 1000);
        if (diffSec < 0) return "Before start";
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')} into session`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden bg-white/95 backdrop-blur-2xl border-white/20 shadow-2xl rounded-[2.5rem]">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <DialogHeader className="px-10 py-8 border-b border-gray-100 bg-white/50">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                                    <ShieldAlert className="h-6 w-6 text-[#F97316]" />
                                    Integrity Audit Log
                                </DialogTitle>
                                <DialogDescription className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                                    Detailed session telemetry for {candidateName}
                                </DialogDescription>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="px-5 py-2 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                                    <Hash className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm font-black text-gray-900">{events.length}</span>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Signals</span>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Main Content */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Sidebar: Signals List */}
                        <div className="w-[380px] border-r border-gray-100 bg-gray-50/30">
                            <div className="h-full overflow-y-auto scrollbar-hide">
                                <div className="p-6 space-y-4">
                                    <h4 className="px-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Signal Frequency</h4>
                                    {groupedEvents.length === 0 ? (
                                        <div className="p-10 text-center space-y-3">
                                            <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto">
                                                <Monitor className="h-6 w-6" />
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">No proctoring signals detected for this session.</p>
                                        </div>
                                    ) : (
                                        groupedEvents.map((group) => (
                                            <button
                                                key={group.type}
                                                onClick={() => setSelectedEvent(selectedEvent === group.type ? null : group.type)}
                                                className={cn(
                                                    "w-full p-4 rounded-3xl border transition-all duration-300 flex flex-col gap-3 group text-left",
                                                    selectedEvent === group.type 
                                                        ? "bg-white border-[#F97316]/20 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100" 
                                                        : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-md"
                                                )}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1">
                                                        <span className="text-[13px] font-black text-gray-900 tracking-tight">{group.label}</span>
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn(
                                                                "h-1.5 w-1.5 rounded-full",
                                                                group.severity === 'high' ? "bg-rose-500" : group.severity === 'medium' ? "bg-amber-500" : "bg-emerald-500"
                                                            )} />
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{group.severity} risk</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-10 w-10 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                                                        <span className="text-sm font-black text-gray-900 group-hover:text-[#F97316]">{group.count}</span>
                                                    </div>
                                                </div>
                                                
                                                {selectedEvent === group.type && (
                                                    <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div className="flex flex-col gap-1.5">
                                                            {group.timestamps.map((ts, i) => (
                                                                <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-gray-100/50 border border-gray-100">
                                                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Occurrence #{i + 1}</span>
                                                                    <span className="text-[10px] font-black text-gray-900">
                                                                        {formatRelativeTime(ts)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Main View: Screenshots Timeline */}
                        <div className="flex-1 bg-white">
                            <div className="h-full overflow-y-auto scrollbar-hide">
                                <div className="p-10 space-y-10">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-3">
                                            <Camera className="h-4 w-4 text-[#F97316]" />
                                            Evidence Snapshots ({snapshots.length})
                                        </h4>
                                        <p className="text-[11px] font-bold text-gray-400">Captures every visual anomaly</p>
                                    </div>

                                    {snapshots.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed border-gray-100 rounded-[3rem] bg-gray-50/30">
                                            <Eye className="h-10 w-10 text-gray-200 mb-4" />
                                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No visual snapshots available</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-6">
                                            {snapshots.map((url, i) => (
                                                <div key={i} className="group relative aspect-video rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] cursor-pointer">
                                                    <img 
                                                        src={url} 
                                                        alt={`Snapshot ${i+1}`} 
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-3.5 w-3.5 text-orange-400" />
                                                                <span className="text-white text-[11px] font-bold uppercase tracking-widest">Snapshot {i + 1}</span>
                                                            </div>
                                                            <button className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/40 transition-colors">
                                                                <ExternalLink className="h-4 w-4 text-white" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    
                                    <div className="p-10 rounded-[3rem] bg-orange-50/50 border border-orange-100 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <AlertCircle className="h-5 w-5 text-[#F97316]" />
                                            <h5 className="text-[13px] font-black text-gray-900 uppercase tracking-tight">Audit Insight</h5>
                                        </div>
                                        <p className="text-[14px] font-medium text-gray-600 leading-relaxed italic">
                                            "Telemetry highlights are correlated with the interview timeline. Red dots in the sidebar indicate high-risk behaviors observed at the exact moment of browser focus loss or audio anomalies."
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
