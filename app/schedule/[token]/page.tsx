"use client";
import { useState, useEffect, use, useCallback } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle, Calendar, ExternalLink, ArrowRight, Info, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";

interface PageProps { params: Promise<{ token: string }> }

type Phase = "loading" | "calendar" | "confirmed" | "error" | "already_booked";

const TIMEZONE = "Asia/Kolkata";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function toISTDateStr(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // YYYY-MM-DD
}

function formatSlotIST(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-IN", {
        timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true,
    });
}

function formatScheduledAt(iso: string): string {
    return new Date(iso).toLocaleString("en-IN", {
        timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric",
        year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
    });
}

// Build calendar grid for a given month (YYYY-MM-DD strings in IST)
function buildCalendarGrid(year: number, month: number): (string | null)[] {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
        grid.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return grid;
}

export default function SchedulePage({ params }: PageProps) {
    const { token } = use(params);

    const [phase, setPhase] = useState<Phase>("loading");
    const [info, setInfo] = useState<{ candidateName: string; jobTitle: string; orgName: string; duration: number } | null>(null);
    const [error, setError] = useState("");
    const [confirmedAt, setConfirmedAt] = useState("");
    const [deadline, setDeadline] = useState<Date | null>(null);

    // Calendar state
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const [viewYear, setViewYear] = useState(nowIST.getFullYear());
    const [viewMonth, setViewMonth] = useState(nowIST.getMonth());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [slots, setSlots] = useState<string[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    // Initial load: fetch interview info + deadline
    useEffect(() => {
        fetch(`/api/schedule/${token}`)
            .then(r => r.json())
            .then(data => {
                if (data.alreadyBooked) { setPhase("already_booked"); setConfirmedAt(data.scheduledAt); return; }
                if (data.error) { setError(data.error); setPhase("error"); return; }
                setInfo(data.info);
                if (data.deadline) setDeadline(new Date(data.deadline));
                setTimeout(() => setPhase("calendar"), 300); // Slight delay for smooth transition
            })
            .catch(() => { setError("Failed to load scheduling page."); setPhase("error"); });
    }, [token]);

    const loadSlots = useCallback(async (date: string) => {
        setLoadingSlots(true);
        setSlots([]);
        setSelectedSlot(null);
        try {
            const r = await fetch(`/api/schedule/${token}?date=${date}`);
            const data = await r.json();
            setSlots(data.slots ?? []);
        } finally {
            setLoadingSlots(false);
        }
    }, [token]);

    const handleDayClick = (date: string) => {
        setSelectedDate(date);
        loadSlots(date);
    };

    const handleConfirm = async () => {
        if (!selectedSlot || confirming) return;
        setConfirming(true);
        try {
            const r = await fetch(`/api/schedule/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slotISO: selectedSlot }),
            });
            const data = await r.json();
            if (data.slotFull) {
                toast.error("Please apply in a different slot, it got filled up.");
                await loadSlots(selectedDate!);
                setSelectedSlot(null);
                return;
            }
            if (!data.success) { setError(data.error || "Booking failed"); setPhase("error"); return; }
            setConfirmedAt(data.scheduledAt);
            setPhase("confirmed");
        } finally {
            setConfirming(false);
        }
    };

    const todayStr = toISTDateStr(new Date());
    const grid = buildCalendarGrid(viewYear, viewMonth);
    const canGoPrev = !(viewYear === nowIST.getFullYear() && viewMonth === nowIST.getMonth());

    const goGoogleCal = () => {
        if (!confirmedAt || !info) return;
        const start = new Date(confirmedAt);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`AI Interview – ${info.jobTitle}`)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`AI Interview for ${info.jobTitle} at ${info.orgName}`)}&sf=true&output=xml`;
        window.open(url, "_blank");
    };

    const goOutlookCal = () => {
        if (!confirmedAt || !info) return;
        const start = new Date(confirmedAt);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const url = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(`AI Interview – ${info.jobTitle}`)}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${encodeURIComponent(`AI Interview for ${info.jobTitle} at ${info.orgName}`)}`;
        window.open(url, "_blank");
    };

    const goIcal = () => {
        if (!confirmedAt || !info) return;
        const start = new Date(confirmedAt);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const ical = [
            "BEGIN:VCALENDAR", "VERSION:2.0",
            "BEGIN:VEVENT",
            `DTSTART:${fmt(start)}`,
            `DTEND:${fmt(end)}`,
            `SUMMARY:AI Interview – ${info.jobTitle}`,
            `DESCRIPTION:AI Interview for ${info.jobTitle} at ${info.orgName}`,
            "END:VEVENT", "END:VCALENDAR",
        ].join("\r\n");
        const blob = new Blob([ical], { type: "text/calendar" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "interview.ics"; a.click();
    };

    if (phase === "loading") {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
                <div className="relative w-16 h-16 flex items-center justify-center mb-4">
                    <div className="absolute inset-0 border-4 border-violet-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
                    <Video className="w-5 h-5 text-violet-600 animate-pulse" />
                </div>
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider animate-pulse">Preparing your session...</p>
            </div>
        );
    }

    if (phase === "error") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
                <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center animate-in zoom-in-95 duration-500" style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                    <p className="text-gray-900 font-semibold text-xl mb-2">Link Unavailable</p>
                    <p className="text-gray-500 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    if (phase === "already_booked" || phase === "confirmed") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
                <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center animate-in zoom-in-95 slide-in-from-bottom-8 duration-500" style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                        <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
                        <CheckCircle className="w-10 h-10 text-emerald-500 relative z-10" />
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">Booking Confirmed</h1>
                    {info && <p className="text-gray-600 font-medium mb-1">{info.jobTitle}</p>}
                    {confirmedAt && (
                        <p className="text-violet-600 text-sm font-semibold mb-8">{formatScheduledAt(confirmedAt)}</p>
                    )}
                    {phase === "confirmed" && (
                        <p className="text-sm text-gray-500 mb-8 leading-relaxed">A confirmation email with your interview link has been sent to you.</p>
                    )}
                    <div className="flex flex-col gap-3 justify-center">
                        <button onClick={goGoogleCal} className="group inline-flex items-center justify-between gap-1.5 h-12 px-5 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-700 transition-all hover:-translate-y-0.5" style={{ border: "1px solid #E9E7FF", boxShadow: "0 4px 16px rgba(124,58,237,0.04)" }}>
                            <div className="flex items-center gap-2">
                                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
                                <span>Add to Google Calendar</span>
                            </div>
                            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-violet-500" />
                        </button>
                        <button onClick={goOutlookCal} className="group inline-flex items-center justify-between gap-1.5 h-12 px-5 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-700 transition-all hover:-translate-y-0.5" style={{ border: "1px solid #E9E7FF", boxShadow: "0 4px 16px rgba(124,58,237,0.04)" }}>
                            <div className="flex items-center gap-2">
                                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
                                <span>Add to Outlook</span>
                            </div>
                            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-violet-500" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Calendar phase
    return (
        <div className="min-h-screen flex items-center justify-center p-4 animate-in fade-in duration-700" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
            <div className={cn("bg-white rounded-2xl w-full overflow-hidden transition-all duration-500 animate-in slide-in-from-bottom-8", selectedDate ? "max-w-5xl" : "max-w-3xl")} style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                <div className="flex flex-col md:flex-row min-h-[550px]">

                    {/* Left: Details */}
                    <div className="p-8 md:p-10 md:w-80 flex-shrink-0 flex flex-col justify-between" style={{ borderRight: "1px solid #F0EEF8", background: "linear-gradient(180deg, #FAFAFC 0%, #FFFFFF 100%)" }}>
                        <div>
                            <div className="mb-10">
                                <img src="/sreevaai-logo.png" alt="Sreeva AI" className="h-8 object-contain hover:opacity-80 transition-opacity cursor-pointer" />
                            </div>
                            <p className="text-[11px] font-semibold text-violet-600 uppercase tracking-widest mb-2">{info?.orgName}</p>
                            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-8 leading-[1.15]">{info?.jobTitle}</h1>
                            
                            <div className="space-y-4">
                                <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-violet-50/50 text-sm font-medium text-gray-700" style={{ border: "1px solid #E9E7FF" }}>
                                    <Clock className="w-4 h-4 text-violet-600" />
                                    <span>20 min interview</span>
                                </div>
                                <br />
                                <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-violet-50/50 text-sm font-medium text-gray-700" style={{ border: "1px solid #E9E7FF" }}>
                                    <MapPin className="w-4 h-4 text-violet-600" />
                                    <span>India Standard Time</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 space-y-4">
                            {deadline && (
                                <div className="p-4 bg-red-50/50 rounded-xl flex items-start gap-3" style={{ border: "1px solid #FCA5A5" }}>
                                    <Info className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-0.5">Booking Deadline</p>
                                        <p className="text-sm font-medium text-red-900">{new Date(deadline).toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: TIMEZONE })}</p>
                                    </div>
                                </div>
                            )}
                            <div className="p-5 rounded-2xl shadow-sm transition-all hover:shadow-md" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E9E7FF" }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-violet-100">
                                        <Video className="w-3.5 h-3.5 text-violet-600" />
                                    </div>
                                    <strong className="text-sm font-semibold text-gray-900">How it works</strong>
                                </div>
                                <ul className="text-[13px] text-gray-600 space-y-2.5 leading-relaxed">
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> Pick a suitable time slot</li>
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> Receive the secure link via email</li>
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> Join 5 mins early for setup</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Right: Calendar + Slots */}
                    <div className="flex-1 p-8 md:p-10 bg-white relative">
                        {/* Month nav */}
                        <div className="flex items-center justify-between mb-8">
                            <span className="text-lg font-semibold text-gray-900">{MONTHS[viewMonth]} {viewYear}</span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        if (!canGoPrev) return;
                                        setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
                                        setSelectedDate(null); setSlots([]);
                                    }}
                                    disabled={!canGoPrev}
                                    className={cn("p-2 rounded-xl transition-all duration-200", canGoPrev ? "hover:bg-violet-50 text-gray-600 hover:text-violet-700 active:scale-95" : "text-gray-200 cursor-not-allowed")}
                                    style={canGoPrev ? { border: "1px solid #E9E7FF" } : undefined}
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => {
                                        setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
                                        setSelectedDate(null); setSlots([]);
                                    }}
                                    className="p-2 rounded-xl hover:bg-violet-50 text-gray-600 hover:text-violet-700 transition-all duration-200 active:scale-95"
                                    style={{ border: "1px solid #E9E7FF" }}
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 mb-4">
                            {WEEKDAYS.map(d => (
                                <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400 py-1">{d}</div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-y-2 gap-x-1 mb-6">
                            {grid.map((date, i) => {
                                if (!date) return <div key={i} />;
                                const isPast = date < todayStr;
                                const deadlineStr = deadline ? toISTDateStr(deadline) : null;
                                const isAfterDeadline = !!(deadlineStr && date > deadlineStr);
                                const isDisabled = isPast || isAfterDeadline;
                                const isSelected = date === selectedDate;
                                const isToday = date === todayStr;
                                return (
                                    <button
                                        key={date}
                                        disabled={isDisabled}
                                        onClick={() => handleDayClick(date)}
                                        title={isAfterDeadline ? "Booking deadline has passed" : ""}
                                        className={cn(
                                            "aspect-square w-10 mx-auto flex items-center justify-center text-sm rounded-full transition-all duration-200 font-medium",
                                            isDisabled && "text-gray-300 cursor-not-allowed",
                                            !isDisabled && !isSelected && "text-gray-700 hover:bg-violet-50 hover:text-violet-700 hover:scale-110 active:scale-95",
                                            isToday && !isSelected && !isDisabled && "text-violet-600 font-bold",
                                            isSelected && "text-white shadow-lg scale-110",
                                        )}
                                        style={isSelected ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" } : isToday && !isSelected && !isDisabled ? { border: "1px solid #E9E7FF", backgroundColor: "#F5F3FF" } : undefined}
                                    >
                                        {parseInt(date.split("-")[2])}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: Slots */}
                    {selectedDate && (
                        <div className="p-8 md:p-10 md:w-[340px] flex-shrink-0 animate-in slide-in-from-right-8 duration-500" style={{ borderLeft: "1px solid #F0EEF8", backgroundColor: "#FAFAFC" }}>
                            <div className="h-full flex flex-col">
                                <p className="text-xs font-semibold text-gray-500 mb-1">Available Slots For</p>
                                <p className="text-base font-semibold text-gray-900 mb-6">
                                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
                                </p>
                                
                                {loadingSlots ? (
                                    <div className="flex-1 flex justify-center items-center py-12">
                                        <div className="relative w-10 h-10 flex items-center justify-center">
                                            <div className="absolute inset-0 border-2 border-violet-200 rounded-full"></div>
                                            <div className="absolute inset-0 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    </div>
                                ) : slots.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                                        <Calendar className="w-8 h-8 text-gray-300 mb-3" />
                                        <p className="text-sm font-medium text-gray-500">No slots available</p>
                                        <p className="text-xs text-gray-400 mt-1">Please select another date</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 space-y-2.5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {slots.map((slot, idx) => {
                                            const isChosen = selectedSlot === slot;
                                            return (
                                                <div key={slot} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}>
                                                    {!isChosen ? (
                                                        <button
                                                            onClick={() => setSelectedSlot(slot)}
                                                            className="group w-full flex items-center justify-between px-5 py-3.5 bg-white rounded-xl text-sm font-medium text-gray-700 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                                                            style={{ border: "1px solid #E9E7FF" }}
                                                            onMouseEnter={e => { e.currentTarget.style.borderColor = "#8B5CF6"; }}
                                                            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E9E7FF"; }}
                                                        >
                                                            <span className="group-hover:text-violet-700 transition-colors">{formatSlotIST(slot)}</span>
                                                            <ArrowRight className="w-4 h-4 text-violet-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                                        </button>
                                                    ) : (
                                                        <div className="bg-white rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200" style={{ border: "2px solid #8B5CF6", boxShadow: "0 10px 25px rgba(124,58,237,0.15)" }}>
                                                            <div className="flex items-center justify-between px-5 py-3.5 bg-violet-50">
                                                                <span className="text-sm font-semibold text-violet-900">{formatSlotIST(slot)}</span>
                                                                <button onClick={() => setSelectedSlot(null)} className="text-violet-400 hover:text-violet-700 transition-colors p-1 rounded-full hover:bg-violet-100">
                                                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 1L1 13M1 1L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                                </button>
                                                            </div>
                                                            <div className="p-4 bg-white">
                                                                <button
                                                                    onClick={handleConfirm}
                                                                    disabled={confirming}
                                                                    className="btn-shimmer relative overflow-hidden group w-full flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:shadow-lg disabled:opacity-60 hover:-translate-y-0.5"
                                                                    style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}
                                                                >
                                                                    <span className="relative z-10">{confirming ? "Confirming..." : `Confirm Booking`}</span>
                                                                    {!confirming && <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
