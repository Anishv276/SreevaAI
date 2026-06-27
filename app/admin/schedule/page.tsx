"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Event } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Loader2, ChevronRight, Briefcase, Calendar as CalendarIcon, Clock, ChevronLeft, Target, Search, Filter, ChevronDown, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

const CustomToolbar = (toolbar: any) => {
  const goToBack = () => {
    toolbar.onNavigate('PREV');
  };
  const goToNext = () => {
    toolbar.onNavigate('NEXT');
  };
  const goToCurrent = () => {
    toolbar.onNavigate('TODAY');
  };

  const label = () => {
    const date = format(toolbar.date, 'MMMM yyyy');
    return <span className="text-[17px] font-extrabold text-gray-800 tracking-tight">{date}</span>;
  };

  return (
    <div className="flex flex-col lg:flex-row items-center justify-between mb-6 px-2 gap-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <button onClick={goToBack} className="text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          {label()}
          <button onClick={goToNext} className="text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <Button variant="outline" className="h-9 px-4 rounded-full border-gray-200 text-gray-400 font-bold text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center gap-2 hover:bg-violet-50" onClick={goToCurrent}>
          <Target className="h-4 w-4" /> Today
        </Button>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="relative group/search hidden md:block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
            <Input
                placeholder="Search candidate or id..."
                className="pl-10 h-10 w-[280px] border-gray-200 bg-white rounded-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-semibold text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-gray-700 placeholder:text-gray-400"
            />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-gray-200 bg-white text-gray-400 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:text-gray-600 hover:bg-violet-50">
           <Filter className="h-4 w-4" />
        </Button>
        <Button variant="outline" className="h-10 px-4 rounded-full border-gray-200 bg-white text-gray-700 font-bold text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center gap-2 hover:bg-violet-50">
           <CalendarIcon className="h-4 w-4 text-gray-400" /> Month <ChevronDown className="h-4 w-4 text-gray-400" />
        </Button>
        <Link href="/admin/create-drive">
          <Button className="h-10 w-10 rounded-full text-white shadow-lg p-0 flex items-center justify-center transition-all">
             <Plus className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default function SchedulePage() {
  const [events, setEvents] = useState<InterviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [navigatingCandidate, setNavigatingCandidate] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/admin/schedule");
        if (!res.ok) throw new Error("Failed to fetch schedule");
        const data = await res.json();
        const formattedEvents = data.events.map((ev: any) => {
          const startDate = new Date(ev.start);
          return {
            ...ev,
            start: startDate,
            end: new Date(ev.end),
            title: `${format(startDate, "h:mm a")} ${ev.candidate.name.split(" ")[0]}`
          };
        });
        setEvents(formattedEvents);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  const handleSelectEvent = (event: InterviewEvent) => {
    setNavigatingCandidate(event.candidate.id);
    router.push(`/admin/candidates/drive/${event.candidate.driveId}?candidateId=${event.candidate.id}`);
  };

  const handleCandidateClick = (event: InterviewEvent) => {
    setNavigatingCandidate(event.candidate.id);
    router.push(`/admin/candidates/drive/${event.candidate.driveId}?candidateId=${event.candidate.id}`);
  };

  const handleSelectSlot = (slotInfo: { start: Date }) => {
    setSelectedDate(new Date(slotInfo.start));
    setIsModalOpen(true);
  };

  const selectedDayEvents = selectedDate 
    ? events.filter(e => e.start && format(new Date(e.start as Date), "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd"))
    : [];

  const getEventStyle = (event: InterviewEvent) => {
    return {
      style: {
        backgroundColor: "#10b981", // vibrant green from the image
        border: "0px",
        borderRadius: "4px", // slight rounding as in the image
        opacity: 1,
        color: "white",
        display: "block",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 700,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
      },
    };
  };

  const CustomDateHeader = ({ date, label }: { date: Date; label: string }) => {
    const dayEvents = events.filter(e => e.start && format(new Date(e.start as Date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd"));
    return (
      <div className="flex items-center justify-end gap-1.5 w-full">
        {dayEvents.length > 0 && (
          <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100 leading-none">
            {dayEvents.length}
          </span>
        )}
        <span>{label}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      <style dangerouslySetInnerHTML={{__html: `
        /* Calendar Custom Overrides matching the beautiful UI */
        .schedule-calendar .rbc-month-view {
          border: none;
          border-radius: 16px;
          overflow: hidden;
        }
        .schedule-calendar .rbc-header {
          padding: 12px 0;
          font-weight: 700;
          font-size: 11px;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #F0EEF8;
          border-left: none;
        }
        .schedule-calendar .rbc-month-row {
          border-top: 1px solid #F0EEF8;
        }
        .schedule-calendar .rbc-day-bg {
          border-left: 1px solid #F0EEF8;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .schedule-calendar .rbc-day-bg:hover {
          background-color: #f8fafc;
        }
        .schedule-calendar .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid #F0EEF8;
        }
        .schedule-calendar .rbc-date-cell {
          padding: 8px 12px;
          font-weight: 600;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
        }
        .schedule-calendar .rbc-off-range-bg {
          background-color: transparent;
        }
        .schedule-calendar .rbc-off-range .rbc-button-link {
          color: #cbd5e1;
        }
        .schedule-calendar .rbc-today {
          background-color: transparent;
        }
        .schedule-calendar .rbc-today .rbc-button-link {
          background-color: #7C3AED;
          color: white;
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          margin-top: -4px;
        }
        .schedule-calendar .rbc-event {
          background-color: transparent;
          padding: 0;
        }
        .schedule-calendar .rbc-event-content {
          font-size: 11px;
        }
      `}} />

      {/* ── Page Header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Calendar</h1>
        <p className="text-sm text-gray-400 mt-0.5">Interview schedule overview</p>
      </div>

      {/* Calendar Card */}
      <div className="bg-white rounded-2xl p-6 min-h-[60vh] overflow-hidden" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="h-[600px] schedule-calendar">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: "100%", fontFamily: "inherit" }}
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              selectable={true}
              eventPropGetter={getEventStyle}
              views={["month", "week", "day"]}
              components={{
                toolbar: CustomToolbar,
                month: {
                  dateHeader: CustomDateHeader
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Daily View Modal matching the provided UI */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-[24px] p-0 overflow-hidden border border-gray-100 shadow-2xl bg-[#f8fafc] flex flex-col my-auto max-h-[90vh] [&>button]:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
          <DialogTitle className="sr-only">Schedule Details</DialogTitle>
          {selectedDate && (
            <>
              {/* Header */}
              <div className="px-6 py-6 border-b border-gray-200/50 shrink-0 bg-white">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h2 className="text-[24px] font-extrabold text-gray-800 flex items-center gap-2">
                      {format(selectedDate, "EEEE")} 
                      <span className="h-7 w-7 rounded-full bg-blue-50 text-blue-500 text-[14px] flex items-center justify-center border border-blue-100 font-bold">
                        {selectedDayEvents.length}
                      </span>
                    </h2>
                    <p className="text-gray-500 font-medium text-[15px]">{format(selectedDate, "MMMM d, yyyy")}</p>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-[10px] border border-violet-500 text-gray-500 hover:bg-violet-50 hover:text-violet-600 transition-colors shadow-sm bg-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* Event List */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {selectedDayEvents.length === 0 ? (
                  <p className="text-gray-400 text-center py-6 text-[14px] font-medium">No interviews for this date.</p>
                ) : (
                  selectedDayEvents.map((event, i) => (
                    <div onClick={() => handleCandidateClick(event)} key={event.id} className="block">
                      <div 
                        className="bg-white rounded-[24px] p-5 flex flex-col gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] cursor-pointer animate-in slide-in-from-bottom-8 fade-in fill-mode-both"
                        style={{ animationDuration: '600ms', animationDelay: `${i * 100}ms` }}
                      >
                        <div className="flex items-center gap-4">
                           <Avatar className="h-14 w-14 border border-gray-100 shadow-sm shrink-0">
                              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${event.candidate.name}`} />
                              <AvatarFallback className="bg-violet-400 text-white font-bold">{event.candidate.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                           </Avatar>
                           <div className="min-w-0 flex-1">
                              <h3 className="text-[18px] font-bold text-gray-800 truncate leading-tight uppercase tracking-tight">{event.candidate.name}</h3>
                              <p className="text-gray-500 font-medium text-[13px] flex items-center gap-1.5 mt-1 truncate">
                                 <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                 {event.candidate.role}
                              </p>
                           </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-4 border-t border-gray-100">
                           <p className="text-[13px] font-semibold text-gray-400 flex items-center gap-2">
                             {navigatingCandidate === event.candidate.id && (
                               <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                             )}
                             {format(new Date(event.start as Date), "d MMM yyyy")} &bull; {format(new Date(event.start as Date), "h:mm a")}
                           </p>
                           {event.candidate.score !== null && (
                             <div className="h-10 w-10 rounded-full border-[2px] border-violet-500 text-violet-600 text-[14px] font-black flex items-center justify-center bg-white shadow-sm">
                               {event.candidate.score}
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
