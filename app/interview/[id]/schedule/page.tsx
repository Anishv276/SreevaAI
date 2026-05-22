"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Loader2,
    Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Slot = {
    slotId?: string;
    startTime: string;
    endTime?: string;
    available?: number;
};

const formatDateKey = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const formatSlotTime = (value: string) =>
    new Date(value).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });

const formatFullDate = (value: string | null) =>
    value
        ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
          })
        : "Select a date";

export default function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
    const [id, setId] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const orgNameFromLink = searchParams.get("orgName")?.trim() || "";
    const [phase, setPhase] = useState<"loading" | "booking" | "details" | "booking_confirmed" | "already_booked">("loading");
    const [slots, setSlots] = useState<Slot[]>([]);
    const [bookedSlot, setBookedSlot] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
    const [bookingCompany, setBookingCompany] = useState<string>(orgNameFromLink || "Company");
    const [interviewRoleLabel, setInterviewRoleLabel] = useState<string>("Interview");
    const [candidateName, setCandidateName] = useState<string>("");
    const [candidateEmail, setCandidateEmail] = useState<string>("");
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [pendingSlotTime, setPendingSlotTime] = useState<string | null>(null);

    useEffect(() => {
        params.then((p) => setId(p.id));
    }, [params]);

    useEffect(() => {
        if (!id) return;
        let isMounted = true;
        fetch(`/api/interview/${id}/slots`)
            .then((res) => res.json())
            .then((data) => {
                if (!isMounted) return;
                if (data.role) setInterviewRoleLabel(data.role);
                if (data.company) setBookingCompany(data.company);
                const incomingSlots = ((data.slots || []) as Slot[]).slice().sort(
                    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                );
                setSlots(incomingSlots);

                const firstSlotDate = incomingSlots.length ? new Date(incomingSlots[0].startTime) : null;
                if (firstSlotDate) {
                    const key = formatDateKey(firstSlotDate);
                    setSelectedDate(key);
                    setCurrentMonthDate(new Date(firstSlotDate.getFullYear(), firstSlotDate.getMonth(), 1));
                }

                if (data.bookedSlot) {
                    setBookedSlot(data.bookedSlot);
                    setPhase("already_booked");
                } else {
                    setPhase("booking");
                }
            })
            .catch(() => {
                if (isMounted) setPhase("booking");
            });
        return () => {
            isMounted = false;
        };
    }, [id]);

    const availableDates = useMemo(() => {
        return new Set(
            slots.map((slot) => {
                const date = new Date(slot.startTime);
                return formatDateKey(date);
            })
        );
    }, [slots]);

    const selectedSlots = useMemo(() => {
        if (!selectedDate) return [];
        return slots.filter((slot) => formatDateKey(new Date(slot.startTime)) === selectedDate);
    }, [slots, selectedDate]);

    if (!id) return null;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#ffedd5_38%,_#f8fafc_100%)] text-slate-900 flex flex-col font-sans">
            <AnimatePresence mode="wait">
                {phase === "loading" && (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex items-center justify-center"
                    >
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                    </motion.div>
                )}

                {phase === "already_booked" && (
                    <motion.div
                        key="already_booked"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 flex items-center justify-center p-4"
                    >
                        <div className="max-w-md w-full bg-white/90 backdrop-blur border border-slate-200 shadow-2xl rounded-3xl p-7 space-y-5 text-center">
                            <div className="mx-auto w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Already Scheduled</h2>
                            <p className="text-slate-600 font-medium leading-relaxed">
                                You have already scheduled this interview for{" "}
                                <strong>
                                    {bookedSlot
                                        ? new Date(bookedSlot).toLocaleString("en-US", {
                                              weekday: "short",
                                              month: "short",
                                              day: "numeric",
                                              hour: "numeric",
                                              minute: "2-digit",
                                          })
                                        : ""}
                                </strong>
                                .
                            </p>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-6">
                                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                                    Please check your email for the unique link to join the interview.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {phase === "booking" && (
                    <motion.div
                        key="booking"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="flex-1 w-full z-10 flex flex-col items-center justify-center p-3 sm:p-4 lg:p-6"
                    >
                        <div className="w-full max-w-6xl bg-white/90 backdrop-blur border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.10)] rounded-[1.75rem] overflow-hidden">
                            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
                                <aside className="p-5 sm:p-6 xl:p-7 border-b xl:border-b-0 xl:border-r border-slate-200 bg-slate-50/80">
                                    <div className="space-y-6 sticky top-4">
                                        <div className="space-y-3">
                                            <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold uppercase tracking-[0.2em]">
                                                {bookingCompany}
                                            </div>
                                            <div className="space-y-2">
                                                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{interviewRoleLabel}</h1>
                                                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                                    Pick a slot that works for you. The calendar and time list update together, so you can scan availability quickly.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-3 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                                                    <Video className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">20 min AI Interview</p>
                                                    <p className="text-xs text-slate-500">Google Meet</p>
                                                </div>
                                            </div>

                                            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-slate-700">
                                                    <Clock3 className="w-4 h-4 flex-none" />
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 leading-none">Timezone</p>
                                                        <p className="text-sm font-semibold text-slate-900 mt-1 leading-none">Asia/Calcutta</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between rounded-2xl bg-orange-50 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-orange-700">
                                                    <CalendarDays className="w-4 h-4" />
                                                    <span className="text-sm font-medium">Available days</span>
                                                </div>
                                                <span className="text-sm font-bold text-orange-700">{availableDates.size}</span>
                                            </div>
                                        </div>
                                    </div>
                                </aside>

                                <section className="p-5 sm:p-6 xl:p-7 border-b xl:border-b-0 xl:border-r border-slate-200 bg-white">
                                    <div className="space-y-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                                                    {currentMonthDate.toLocaleString("default", { month: "long", year: "numeric" })}
                                                </h2>
                                                <p className="text-sm text-slate-500 mt-1">Select a day with open times.</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9 rounded-full border-slate-200 bg-white hover:bg-slate-50"
                                                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1))}
                                                >
                                                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9 rounded-full border-slate-200 bg-white hover:bg-slate-50"
                                                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1))}
                                                >
                                                    <ChevronRight className="w-4 h-4 text-slate-600" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-7 gap-1.5 text-center">
                                            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                                                <div key={day} className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] py-1">
                                                    {day}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-7 gap-1.5">
                                            {(() => {
                                                const year = currentMonthDate.getFullYear();
                                                const month = currentMonthDate.getMonth();
                                                const firstDay = new Date(year, month, 1).getDay();
                                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                const days: ReactNode[] = [];

                                                for (let i = 0; i < firstDay; i++) {
                                                    days.push(<div key={`empty-${i}`} className="aspect-square" />);
                                                }

                                                for (let i = 1; i <= daysInMonth; i++) {
                                                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
                                                    const isAvailable = availableDates.has(dateStr);
                                                    const isSelected = selectedDate === dateStr;

                                                    days.push(
                                                        <div key={`day-${i}`} className="flex justify-center aspect-square">
                                                            <button
                                                                type="button"
                                                                disabled={!isAvailable}
                                                                onClick={() => isAvailable && setSelectedDate(dateStr)}
                                                                className={cn(
                                                                    "w-full h-full rounded-xl flex items-center justify-center text-sm font-semibold transition-all duration-200 border",
                                                                    !isAvailable
                                                                        ? "border-transparent text-slate-300 bg-slate-50 cursor-not-allowed"
                                                                        : "border-slate-200 text-slate-700 bg-slate-50 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 hover:-translate-y-0.5",
                                                                    isSelected ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/15" : ""
                                                                )}
                                                            >
                                                                {i}
                                                            </button>
                                                        </div>
                                                    );
                                                }

                                                return days;
                                            })()}
                                        </div>
                                    </div>
                                </section>

                                <aside className="p-5 sm:p-6 xl:p-7 bg-slate-50/80">
                                    <div className="h-full flex flex-col">
                                        <div className="flex items-start justify-between gap-3 mb-5">
                                            <div>
                                                <h3 className="text-lg font-black text-slate-900 tracking-tight">{formatFullDate(selectedDate)}</h3>
                                                <p className="text-sm text-slate-500 mt-1">
                                                    {selectedSlots.length ? `${selectedSlots.length} available slot${selectedSlots.length === 1 ? "" : "s"}` : "No slots for this day"}
                                                </p>
                                            </div>
                                            <div className="rounded-full bg-white border border-slate-200 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                                Slots
                                            </div>
                                        </div>

                                        <div className="flex-1 rounded-[1.5rem] bg-white border border-slate-200 shadow-sm p-3">
                                            {!selectedDate ? (
                                                <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center text-slate-400 space-y-4 py-10">
                                                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                                                        <AlertCircle className="w-8 h-8 text-slate-300" />
                                                    </div>
                                                    <p className="text-sm font-medium leading-relaxed px-4">Please choose a date from the calendar to see the available times.</p>
                                                </div>
                                            ) : selectedSlots.length === 0 ? (
                                                <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center text-slate-400 space-y-4 py-10">
                                                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                                                        <CalendarDays className="w-8 h-8 text-slate-300" />
                                                    </div>
                                                    <p className="text-sm font-medium leading-relaxed px-4">No times are available for this date. Try another day.</p>
                                                </div>
                                            ) : (
                                                <div className="max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
                                                        {selectedSlots.map((slot, index) => {
                                                            const start = new Date(slot.startTime);
                                                            const isHighPriority = index < 3;

                                                            return (
                                                                <Button
                                                                    key={slot.slotId || `${slot.startTime}-${index}`}
                                                                    variant="outline"
                                                                    className={cn(
                                                                        "w-full justify-between h-auto py-3.5 px-4 rounded-2xl border text-slate-700 font-semibold text-sm transition-all shadow-sm hover:shadow-md",
                                                                        isHighPriority
                                                                            ? "border-slate-300 bg-white hover:border-orange-300 hover:bg-orange-50"
                                                                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                                                                    )}
                                                                    onClick={() => {
                                                                        setBookingError(null);
                                                                        setPendingSlotTime(slot.startTime);
                                                                        setPhase("details");
                                                                    }}
                                                                >
                                                                    <span className="flex items-center gap-3">
                                                                        <span
                                                                            className={cn(
                                                                                "h-2.5 w-2.5 rounded-full",
                                                                                isHighPriority ? "bg-emerald-500" : "bg-slate-400"
                                                                            )}
                                                                        />
                                                                        <span>{formatSlotTime(slot.startTime)}</span>
                                                                    </span>
                                                                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                                                                        {start.toLocaleDateString(undefined, { weekday: "short" })}
                                                                    </span>
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </aside>
                            </div>
                        </div>
                    </motion.div>
                )}

                {phase === "details" && (
                    <motion.div
                        key="details"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="flex-1 flex items-center justify-center p-4 z-10"
                    >
                                <div className="max-w-md w-full bg-white/90 backdrop-blur border border-slate-200 shadow-2xl rounded-3xl p-7 space-y-5">
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Confirm your slot</h2>
                            <p className="text-sm text-slate-600 font-medium">
                                Selected time:{" "}
                                <strong>
                                    {pendingSlotTime
                                        ? new Date(pendingSlotTime).toLocaleString("en-US", {
                                              weekday: "short",
                                              month: "short",
                                              day: "numeric",
                                              hour: "numeric",
                                              minute: "2-digit",
                                          })
                                        : "-"}
                                </strong>
                            </p>

                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Name</label>
                                    <input
                                        type="text"
                                        value={candidateName}
                                        onChange={(e) => setCandidateName(e.target.value)}
                                        placeholder="Enter your full name"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Application Email</label>
                                    <input
                                        type="email"
                                        value={candidateEmail}
                                        onChange={(e) => setCandidateEmail(e.target.value)}
                                        placeholder="Enter the same email used in your application"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                                    />
                                </div>
                                {bookingError ? <p className="text-xs font-semibold text-rose-600">{bookingError}</p> : null}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 rounded-xl border-slate-200"
                                    onClick={() => {
                                        setBookingError(null);
                                        setPhase("booking");
                                    }}
                                >
                                    Back
                                </Button>
                                <Button
                                    className="flex-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
                                    onClick={async () => {
                                        const normalizedEmail = candidateEmail.trim().toLowerCase();
                                        const normalizedName = candidateName.trim();
                                        if (!pendingSlotTime) {
                                            setBookingError("Please select a slot first.");
                                            return;
                                        }
                                        if (!normalizedName) {
                                            setBookingError("Please enter your name.");
                                            return;
                                        }
                                        if (!normalizedEmail) {
                                            setBookingError("Please enter your application email.");
                                            return;
                                        }
                                        setBookingError(null);
                                        try {
                                            const res = await fetch(`/api/interview/${id}/book`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    startTime: pendingSlotTime,
                                                    name: normalizedName,
                                                    email: normalizedEmail,
                                                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                                }),
                                            });
                                            if (!res.ok) {
                                                const error = await res.json();
                                                setBookingError(error.error || "Failed to book slot");
                                                return;
                                            }
                                            setBookedSlot(new Date(pendingSlotTime).getTime());
                                            setPhase("booking_confirmed");
                                        } catch (_e) {
                                            setBookingError("Failed to book slot");
                                        }
                                    }}
                                >
                                    Schedule
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {phase === "booking_confirmed" && (
                    <motion.div
                        key="booking_confirmed"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="flex-1 flex items-center justify-center p-4 z-10"
                    >
                        <div className="max-w-md w-full bg-white/90 backdrop-blur border border-slate-200 shadow-2xl rounded-3xl p-7 space-y-5 text-center">
                            <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Interview Scheduled</h2>
                            <p className="text-slate-600 font-medium leading-relaxed">
                                Your AI interview has been confirmed for{" "}
                                <strong>
                                    {bookedSlot
                                        ? new Date(bookedSlot).toLocaleString("en-US", {
                                              weekday: "short",
                                              month: "short",
                                              day: "numeric",
                                              hour: "numeric",
                                              minute: "2-digit",
                                          })
                                        : ""}
                                </strong>
                                .
                            </p>
                            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mt-6">
                                <p className="text-sm text-orange-900 font-medium leading-relaxed">
                                    We&apos;ve sent a confirmation email to you. Please check your inbox and use the unique link provided to join at your scheduled time.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
