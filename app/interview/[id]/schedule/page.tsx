"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Video, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
    const [id, setId] = useState<string | null>(null);
    const [phase, setPhase] = useState<"loading" | "booking" | "details" | "booking_confirmed" | "already_booked">("loading");
    const [slots, setSlots] = useState<any[]>([]);
    const [bookedSlot, setBookedSlot] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
    const [bookingCompany, setBookingCompany] = useState<string>("Company");
    const [interviewRoleLabel, setInterviewRoleLabel] = useState<string>("Interview");
    const [candidateName, setCandidateName] = useState<string>("");
    const [candidateEmail, setCandidateEmail] = useState<string>("");
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [pendingSlotTime, setPendingSlotTime] = useState<string | null>(null);

    useEffect(() => {
        params.then(p => setId(p.id));
    }, [params]);

    useEffect(() => {
        if (!id) return;
        let isMounted = true;
        fetch(`/api/interview/${id}/slots`)
            .then(res => res.json())
            .then(data => {
                if (!isMounted) return;
                if (data.role) setInterviewRoleLabel(data.role);
                if (data.company) setBookingCompany(data.company);
                setSlots(data.slots || []);
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
        return () => { isMounted = false; };
    }, [id]);

    if (!id) return null;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
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
                        <div className="max-w-md w-full bg-white border border-gray-100 shadow-xl rounded-3xl p-8 space-y-6 text-center">
                            <div className="mx-auto w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Already Scheduled</h2>
                            <p className="text-gray-500 font-medium leading-relaxed">
                                You have already scheduled this interview for <strong>{bookedSlot ? new Date(bookedSlot).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</strong>.
                            </p>
                            <div className="bg-orange-50 rounded-2xl p-4 mt-6">
                                <p className="text-sm text-orange-800 font-medium leading-relaxed">
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
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex-1 w-full z-10 flex flex-col items-center justify-center p-4 sm:p-8"
                    >
                        <div className="w-full max-w-4xl bg-white border border-gray-100 shadow-2xl rounded-[2rem] overflow-hidden flex flex-col md:flex-row">
                            {/* LEFT PANE: Calendar */}
                            <div className="flex-1 p-8 md:p-10 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/30">
                                <div className="space-y-8">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-widest mb-2">
                                            {bookingCompany}
                                        </div>
                                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{interviewRoleLabel}</h1>
                                        <p className="text-gray-500 font-medium flex items-center gap-2">
                                            <Video className="w-4 h-4" /> 20 min AI Interview
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                                        {/* Calendar Header */}
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-lg font-bold text-gray-900">
                                                {currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                            </h2>
                                            <div className="flex gap-2">
                                                <Button 
                                                    variant="outline" 
                                                    size="icon" 
                                                    className="h-9 w-9 rounded-full border-gray-200"
                                                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1))}
                                                >
                                                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    size="icon" 
                                                    className="h-9 w-9 rounded-full border-gray-200"
                                                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1))}
                                                >
                                                    <ChevronRight className="w-4 h-4 text-gray-600" />
                                                </Button>
                                            </div>
                                        </div>
                                        
                                        {/* Calendar Grid */}
                                        <div className="grid grid-cols-7 gap-2 text-center mb-3">
                                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                                <div key={day} className="text-[11px] font-black text-gray-400 uppercase tracking-wider py-1">
                                                    {day}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-2">
                                            {(() => {
                                                const year = currentMonthDate.getFullYear();
                                                const month = currentMonthDate.getMonth();
                                                const firstDay = new Date(year, month, 1).getDay();
                                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                const days = [];
                                                
                                                // Group slots by date string (YYYY-MM-DD)
                                                const availableDates = new Set(slots.map(s => {
                                                    const d = new Date(s.startTime);
                                                    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                                }));

                                                for (let i = 0; i < firstDay; i++) {
                                                    days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                                                }
                                                
                                                for (let i = 1; i <= daysInMonth; i++) {
                                                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                                                    const isAvailable = availableDates.has(dateStr);
                                                    const isSelected = selectedDate === dateStr;
                                                    
                                                    days.push(
                                                        <div key={`day-${i}`} className="flex justify-center aspect-square">
                                                            <button
                                                                disabled={!isAvailable}
                                                                onClick={() => isAvailable && setSelectedDate(dateStr)}
                                                                className={cn(
                                                                    "w-full h-full rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                                                                    !isAvailable ? "text-gray-300 cursor-not-allowed" : "text-gray-900 cursor-pointer",
                                                                    isAvailable && !isSelected ? "bg-orange-50 text-orange-700 hover:bg-orange-100 hover:scale-105" : "",
                                                                    isSelected ? "bg-orange-500 text-white shadow-md hover:bg-orange-600 scale-105" : ""
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
                                </div>
                            </div>
                            
                            {/* RIGHT PANE: Time Slots */}
                            <div className="w-full md:w-80 p-8 md:p-10 flex flex-col bg-white">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-6">
                                    {selectedDate 
                                        ? new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                                        : "Select a Date"
                                    }
                                </h3>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 max-h-[420px]">
                                    {!selectedDate ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-4 py-12">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                                <AlertCircle className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-sm font-medium leading-relaxed px-4">Please choose a date from the calendar to see available times.</p>
                                        </div>
                                    ) : (
                                        (() => {
                                            const timesForDate = slots.filter(s => {
                                                const d = new Date(s.startTime);
                                                const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                                return dStr === selectedDate;
                                            });
                                            
                                            if (timesForDate.length === 0) {
                                                return <p className="text-sm text-gray-500 text-center py-8 font-medium">No times available for this date.</p>;
                                            }
                                            
                                            return timesForDate.map((s, i) => {
                                                const start = new Date(s.startTime);
                                                return (
                                                    <Button 
                                                        key={i}
                                                        variant="outline"
                                                        className="w-full justify-center h-auto py-4 px-4 rounded-xl border-orange-200 text-orange-700 font-bold text-base hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all shadow-sm"
                                                        onClick={() => {
                                                            setBookingError(null);
                                                            setPendingSlotTime(s.startTime);
                                                            setPhase("details");
                                                        }}
                                                    >
                                                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </Button>
                                                );
                                            });
                                        })()
                                    )}
                                </div>
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
                        <div className="max-w-md w-full bg-white border border-gray-100 shadow-xl rounded-3xl p-8 space-y-5">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Confirm Your Slot</h2>
                            <p className="text-sm text-gray-600 font-medium">
                                Selected Time:{" "}
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
                                    <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Name</label>
                                    <input
                                        type="text"
                                        value={candidateName}
                                        onChange={(e) => setCandidateName(e.target.value)}
                                        placeholder="Enter your full name"
                                        className="w-full rounded-xl border border-orange-200 px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Application Email</label>
                                    <input
                                        type="email"
                                        value={candidateEmail}
                                        onChange={(e) => setCandidateEmail(e.target.value)}
                                        placeholder="Enter the same email used in your application"
                                        className="w-full rounded-xl border border-orange-200 px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                                    />
                                </div>
                                {bookingError ? <p className="text-xs font-semibold text-red-600">{bookingError}</p> : null}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 rounded-xl"
                                    onClick={() => {
                                        setBookingError(null);
                                        setPhase("booking");
                                    }}
                                >
                                    Back
                                </Button>
                                <Button
                                    className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold"
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
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex-1 flex items-center justify-center p-4 z-10"
                    >
                        <div className="max-w-md w-full bg-white border border-gray-100 shadow-xl rounded-3xl p-8 space-y-6 text-center">
                            <div className="mx-auto w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Interview Scheduled!</h2>
                            <p className="text-gray-500 font-medium leading-relaxed">
                                Your AI interview has been confirmed for <strong>{bookedSlot ? new Date(bookedSlot).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</strong>.
                            </p>
                            <div className="bg-orange-50 rounded-2xl p-4 mt-6">
                                <p className="text-sm text-orange-800 font-medium leading-relaxed">
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
