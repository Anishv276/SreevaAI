"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Event } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Loader2, ChevronRight, Briefcase, ChevronLeft, Plus, X, Calendar as CalendarIcon, ChevronDown, Award, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface Candidate {
  id: string;
  name: string;
  role: string;
  driveId: string;
  score: number | null;
  resumeUrl: string;
}

interface InterviewEvent extends Event {
  id: string;
  status: string;
  candidate: Candidate;
}

// Removed CustomToolbar as we will render it natively

export default function SchedulePage() {
  const [rawEvents, setRawEvents] = useState<InterviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [navigatingCandidate, setNavigatingCandidate] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/admin/schedule");
        if (!res.ok) throw new Error("Failed to fetch schedule");
        const data = await res.json();
        const formattedEvents = data.events.map((ev: any) => ({
          ...ev,
          start: new Date(ev.start),
          end: new Date(ev.end),
        }));
        setRawEvents(formattedEvents);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  const handleCandidateClick = (event: InterviewEvent) => {
    setNavigatingCandidate(event.candidate.id);
    router.push(`/admin/candidates/${event.candidate.id}?report=interview`);
  };

  const handleSelectSlot = (slotInfo: { start: Date }) => {
    setSelectedDate(new Date(slotInfo.start));
  };
  
  const handleSelectEvent = (event: any) => {
    setSelectedDate(new Date(event.start));
  };

  const selectedDayEvents = selectedDate 
    ? rawEvents.filter(e => e.start && format(new Date(e.start as Date), "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd"))
    : [];

  // Group events for the calendar view
  const groupedEvents: any[] = [];
  const groups = rawEvents.reduce((acc: any, ev) => {
    const dateStr = format(ev.start as Date, "yyyy-MM-dd");
    if (!acc[dateStr]) acc[dateStr] = { scheduled: 0, completed: 0, inProgress: 0, noShow: 0, date: ev.start };
    const status = (ev.status || "").toLowerCase();
    if (status === "scheduled") acc[dateStr].scheduled++;
    else if (status === "completed") acc[dateStr].completed++;
    else if (status === "in_progress" || status === "inprogress") acc[dateStr].inProgress++;
    else if (status === "no_show" || status === "noshow") acc[dateStr].noShow++;
    return acc;
  }, {});

  Object.values(groups).forEach((g: any) => {
    if (g.scheduled > 0) groupedEvents.push({ title: `${g.scheduled} Scheduled`, start: g.date, end: g.date, type: "scheduled", allDay: true });
    if (g.completed > 0) groupedEvents.push({ title: `${g.completed} Completed`, start: g.date, end: g.date, type: "completed", allDay: true });
    if (g.inProgress > 0) groupedEvents.push({ title: `${g.inProgress} In Progress`, start: g.date, end: g.date, type: "in_progress", allDay: true });
    if (g.noShow > 0) groupedEvents.push({ title: `${g.noShow} No Show`, start: g.date, end: g.date, type: "no_show", allDay: true });
  });

  const goToBack = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const goToNext = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  const goToCurrent = () => setCalendarDate(new Date());

  const getEventStyle = (event: any) => {
    let bg = "#eff6ff";
    let color = "#3b82f6";
    if (event.type === "completed") { bg = "#f0fdf4"; color = "#22c55e"; }
    if (event.type === "in_progress") { bg = "#fff7ed"; color = "#f97316"; }
    if (event.type === "no_show") { bg = "#fef2f2"; color = "#ef4444"; }

    return {
      style: {
        backgroundColor: bg,
        color: color,
        border: "none",
        borderRadius: "6px",
        opacity: 1,
        display: "block",
        padding: "4px 8px",
        fontSize: "11px",
        fontWeight: 700,
        marginBottom: "4px",
      },
    };
  };

  const CustomDateHeader = ({ date, label }: { date: Date; label: string }) => {
    return (
      <div className="flex items-center justify-end w-full">
        <span className="text-[14px] font-bold text-gray-500 mt-1 mr-1">{label}</span>
      </div>
    );
  };

  return (
    <div className="pb-10 animate-in fade-in duration-500">
      <style dangerouslySetInnerHTML={{__html: `
        .schedule-calendar .rbc-month-view {
          border: 1px solid #f1f5f9;
          border-radius: 20px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        }
        .schedule-calendar .rbc-header {
          padding: 16px 0;
          font-weight: 800;
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-bottom: 1px solid #f1f5f9;
          border-left: none;
        }
        .schedule-calendar .rbc-month-row {
          border-top: 1px solid #f1f5f9;
        }
        .schedule-calendar .rbc-day-bg {
          border-left: 1px solid #f1f5f9;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .schedule-calendar .rbc-day-bg:hover {
          background-color: #f8fafc;
        }
        .schedule-calendar .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid #f1f5f9;
        }
        .schedule-calendar .rbc-date-cell {
          padding: 4px;
        }
        .schedule-calendar .rbc-off-range-bg {
          background-color: #fafafa;
        }
        .schedule-calendar .rbc-off-range .rbc-date-cell span {
          color: #cbd5e1 !important;
        }
        .schedule-calendar .rbc-today {
          background-color: transparent;
        }
        .schedule-calendar .rbc-event {
          background-color: transparent;
          padding: 0;
        }
        .schedule-calendar .rbc-row-content {
          z-index: 2;
        }
      `}} />

      {/* Native Header Out Of Calendar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4 px-1">
        <div>
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight leading-tight">Calendar</h1>
          <p className="text-[14px] text-gray-500 mt-1">Track all AI interviews across your drives.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-200 text-gray-700 font-bold text-[13px] shadow-sm flex items-center gap-2 hover:bg-gray-50 transition-colors" onClick={goToCurrent}>
            <CalendarIcon className="h-4 w-4 text-gray-400" /> Today
          </Button>
          
          <div className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-10">
            <button onClick={goToBack} className="px-3 h-full text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="h-full border-x border-gray-200 flex items-center px-4 font-bold text-[14px] text-gray-900 min-w-[140px] justify-between cursor-pointer hover:bg-gray-50">
              {format(calendarDate, 'MMMM yyyy')}
              <ChevronDown className="h-4 w-4 text-gray-400 ml-2" />
            </div>
            <button onClick={goToNext} className="px-3 h-full text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Link href="/admin/create-drive">
            <Button className="h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm flex items-center gap-2 font-bold text-[13px] transition-colors border-0">
               <Plus className="h-4 w-4" /> New Drive
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Layout Container */}
      <div className="flex flex-col xl:flex-row gap-6 relative">
        
        {/* Left Calendar */}
        <div className="flex-1 min-w-0">
            {loading ? (
            <div className="flex items-center justify-center h-[calc(100vh-220px)] min-h-[600px] bg-white rounded-[24px] border border-gray-100 shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
            </div>
            ) : (
            <div className="h-[calc(100vh-220px)] min-h-[600px] schedule-calendar">
                <Calendar
                localizer={localizer}
                events={groupedEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: "100%", fontFamily: "inherit" }}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                selectable={true}
                eventPropGetter={getEventStyle}
                views={["month"]}
                date={calendarDate}
                onNavigate={(date) => setCalendarDate(date)}
                toolbar={false}
                components={{
                    month: {
                      dateHeader: CustomDateHeader
                    }
                }}
                />
            </div>
            )}
        </div>

        {/* Right Sidebar */}
        <AnimatePresence>
            {selectedDate && (
                <motion.div 
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 380, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    className="shrink-0 bg-[#F8FAFC] rounded-[24px] border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col h-[calc(100vh-220px)] min-h-[600px] overflow-hidden hidden xl:flex"
                >
                {/* Sidebar Header */}
                <div className="px-6 py-6 border-b border-gray-200/50 bg-white shrink-0 flex items-center justify-between">
                    <div>
                        <h2 className="text-[18px] font-black text-gray-900 tracking-tight">
                            {format(selectedDate, "EEEE, MMMM d, yyyy")}
                        </h2>
                    </div>
                    <button onClick={() => setSelectedDate(null)} className="h-8 w-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Daily Stats */}
                <div className="grid grid-cols-4 gap-2 px-6 py-4 border-b border-gray-200/50 bg-white shrink-0">
                    <div className="flex flex-col items-center">
                        <span className="text-[18px] font-black text-blue-500">{selectedDayEvents.length}</span>
                        <span className="text-[10px] font-bold text-blue-500 capitalize tracking-wider">Interviews</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[18px] font-black text-green-500">{selectedDayEvents.filter(e => (e.status||'').toLowerCase() === 'completed').length}</span>
                        <span className="text-[10px] font-bold text-green-500 capitalize tracking-wider">Completed</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[18px] font-black text-orange-500">{selectedDayEvents.filter(e => (e.status||'').toLowerCase() === 'in_progress' || (e.status||'').toLowerCase() === 'inprogress').length}</span>
                        <span className="text-[10px] font-bold text-orange-500 capitalize tracking-wider">In Progress</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[18px] font-black text-red-500">{selectedDayEvents.filter(e => (e.status||'').toLowerCase() === 'no_show' || (e.status||'').toLowerCase() === 'noshow').length}</span>
                        <span className="text-[10px] font-bold text-red-500 capitalize tracking-wider">No Show</span>
                    </div>
                </div>

                {/* Event List (Scrollable) */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                    {selectedDayEvents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center pb-20">
                            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                <CalendarIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <p className="text-gray-900 font-bold text-[15px]">No interviews</p>
                            <p className="text-gray-500 text-[13px] mt-1">There are no interviews scheduled for this day.</p>
                        </div>
                    ) : (
                        selectedDayEvents.map((event, i) => (
                            <div onClick={() => handleCandidateClick(event)} key={event.id} 
                                className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all group animate-in slide-in-from-bottom-4 fade-in fill-mode-both"
                                style={{ animationDelay: `${i * 50}ms` }}>
                                <div className="flex items-start gap-4">
                                    <div className="w-[60px] shrink-0 pt-1">
                                        <span className="text-[12px] font-black text-blue-600">{format(new Date(event.start as Date), "h:mm a")}</span>
                                    </div>
                                    <Avatar className="h-10 w-10 border border-gray-100 shrink-0">
                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${event.candidate.name}`} />
                                        <AvatarFallback className="bg-violet-500 text-white font-bold text-xs">{event.candidate.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1 relative">
                                        <ChevronRight className="h-4 w-4 text-gray-400 absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <h3 className="text-[14px] font-bold text-gray-900 pr-5 truncate">{event.candidate.name}</h3>
                                        <p className="text-gray-500 font-medium text-[12px] mt-0.5 truncate">{event.candidate.role}</p>
                                        <p className="text-gray-400 font-medium text-[11px] mt-0.5 truncate">Drive: {event.candidate.driveId}</p>
                                        
                                        <div className="mt-2">
                                            {(event.status || '').toLowerCase() === 'scheduled' && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md">Scheduled</span>}
                                            {(event.status || '').toLowerCase() === 'completed' && <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded-md">Completed</span>}
                                            {((event.status || '').toLowerCase() === 'in_progress' || (event.status || '').toLowerCase() === 'inprogress') && <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-bold rounded-md">In Progress</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-2 gap-4">
                                    <div className="flex items-center gap-2">
                                        <Award className="h-4 w-4 text-gray-400 shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Score</span>
                                            <span className="text-[12px] font-bold text-gray-900">{event.candidate.score ?? 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Duration</span>
                                            <span className="text-[12px] font-bold text-gray-900">20 mins</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                </motion.div>
            )}
        </AnimatePresence>
      </div>
    </div>
  );
}
