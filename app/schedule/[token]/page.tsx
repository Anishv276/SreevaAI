"use client";
import { useState, useEffect, use, useCallback } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle, Calendar, ExternalLink } from "lucide-react";
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
                setPhase("calendar");
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
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (phase === "error") {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
                    <p className="text-gray-900 font-semibold text-lg mb-2">Link Unavailable</p>
                    <p className="text-gray-500 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    if (phase === "already_booked" || phase === "confirmed") {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Booking Confirmed</h1>
                    {info && <p className="text-gray-600 font-medium mb-1">{info.jobTitle}</p>}
                    {confirmedAt && (
                        <p className="text-gray-400 text-sm mb-8">{formatScheduledAt(confirmedAt)}</p>
                    )}
                    {phase === "confirmed" && (
                        <p className="text-sm text-gray-500 mb-6">A confirmation email with your interview link has been sent to you.</p>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={goGoogleCal} className="flex items-center gap-2 justify-center px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                            Google Calendar
                        </button>
                        <button onClick={goOutlookCal} className="flex items-center gap-2 justify-center px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                            Outlook
                        </button>
                        <button onClick={goIcal} className="flex items-center gap-2 justify-center px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            <Calendar className="w-4 h-4" />
                            iCal
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Calendar phase
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 w-full overflow-hidden transition-all duration-300", selectedDate ? "max-w-5xl" : "max-w-3xl")}>
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 min-h-[500px]">

                    {/* Left: Details */}
                    <div className="p-8 md:w-72 flex-shrink-0">
                        <div className="mb-6">
                            <img src="/sreevaailogo2.png" alt="Sreeva AI" className="h-8 object-contain" />
                        </div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{info?.orgName}</p>
                        <h1 className="text-xl font-bold text-gray-900 mb-6 leading-snug">{info?.jobTitle}</h1>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Clock className="w-4 h-4 text-violet-500 flex-shrink-0" />
                                <span>20 min interview · 30 min slot</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <MapPin className="w-4 h-4 text-violet-500 flex-shrink-0" />
                                <span>India Standard Time (IST)</span>
                            </div>
                        </div>
                        <div className="mt-8 space-y-3">
                            {deadline && (
                                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                                    <strong>Booking Deadline:</strong> {new Date(deadline).toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: TIMEZONE })}
                                </div>
                            )}
                            <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700 leading-relaxed">
                                <strong className="block mb-1">How it works</strong>
                                Pick a slot → Get interview link via email → Join 5 min early for hardware check → Interview starts exactly at slot time.
                            </div>
                        </div>
                    </div>

                    {/* Right: Calendar + Slots */}
                    <div className="flex-1 p-8">
                        {/* Month nav */}
                        <div className="flex items-center justify-between mb-5">
                            <button
                                onClick={() => {
                                    if (!canGoPrev) return;
                                    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
                                    setSelectedDate(null); setSlots([]);
                                }}
                                disabled={!canGoPrev}
                                className={cn("p-1.5 rounded-lg transition-colors", canGoPrev ? "hover:bg-gray-100 text-gray-700" : "text-gray-200 cursor-not-allowed")}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="font-semibold text-gray-900">{MONTHS[viewMonth]} {viewYear}</span>
                            <button
                                onClick={() => {
                                    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
                                    setSelectedDate(null); setSlots([]);
                                }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 mb-2">
                            {WEEKDAYS.map(d => (
                                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-1 mb-6">
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
                                            "aspect-square w-full flex items-center justify-center text-sm rounded-full transition-colors font-medium",
                                            isDisabled && "text-gray-200 cursor-not-allowed",
                                            !isDisabled && !isSelected && "text-gray-700 hover:bg-violet-50 hover:text-violet-600",
                                            isToday && !isSelected && !isDisabled && "border border-violet-300",
                                            isSelected && "bg-violet-600 text-white",
                                        )}
                                    >
                                        {parseInt(date.split("-")[2])}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: Slots */}
                    {selectedDate && (
                        <div className="p-8 md:w-80 flex-shrink-0 bg-gray-50/30">
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
                                </p>
                                {loadingSlots ? (
                                    <div className="flex justify-center py-6">
                                        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : slots.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-4">No slots available on this day</p>
                                ) : (
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                        {slots.map(slot => {
                                            const isChosen = selectedSlot === slot;
                                            return (
                                                <div key={slot}>
                                                    {!isChosen ? (
                                                        <button
                                                            onClick={() => setSelectedSlot(slot)}
                                                            className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 bg-white rounded-xl text-sm font-medium text-gray-700 hover:border-violet-500 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                                                        >
                                                            <span>{formatSlotIST(slot)}</span>
                                                            <span className="text-xs text-gray-400">Select</span>
                                                        </button>
                                                    ) : (
                                                        <div className="border-2 border-violet-500 bg-white rounded-xl overflow-hidden shadow-sm">
                                                            <div className="flex items-center justify-between px-4 py-3 bg-violet-50">
                                                                <span className="text-sm font-semibold text-violet-900">{formatSlotIST(slot)}</span>
                                                                <button onClick={() => setSelectedSlot(null)} className="text-xs text-violet-600 hover:text-violet-800 font-bold p-1">✕</button>
                                                            </div>
                                                            <div className="px-4 pb-3 pt-2 bg-white">
                                                                <button
                                                                    onClick={handleConfirm}
                                                                    disabled={confirming}
                                                                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 shadow-sm"
                                                                >
                                                                    {confirming ? "Confirming..." : `Confirm ${formatSlotIST(slot)}`}
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
