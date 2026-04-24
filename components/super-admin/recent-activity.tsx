"use client";

import { useEffect, useState } from "react";
import { 
    Clock, 
    Building2, 
    Briefcase, 
    UserCheck, 
    Video, 
    ChevronRight,
    Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Activity {
    type: "ORG" | "DRIVE" | "CANDIDATE" | "INTERVIEW";
    detail: string;
    org: string;
    at: string;
}

export function RecentActivity() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchActivity = async () => {
            try {
                const res = await fetch("/api/super-admin/orgs?limit=1");
                if (res.ok) {
                    const data = await res.json();
                    setActivities(data.stats.recentActivity || []);
                }
            } catch (err) {
                console.error("Activity fetch failed", err);
            } finally {
                setLoading(false);
            }
        };
        fetchActivity();
    }, []);

    const getActivityIcon = (type: Activity["type"]) => {
        switch (type) {
            case "ORG": return <Building2 className="h-4 w-4" />;
            case "DRIVE": return <Briefcase className="h-4 w-4" />;
            case "CANDIDATE": return <UserCheck className="h-4 w-4" />;
            case "INTERVIEW": return <Video className="h-4 w-4" />;
        }
    };

    const getActivityColor = (type: Activity["type"]) => {
        switch (type) {
            case "ORG": return "bg-orange-50 text-[#F97316] border-orange-100";
            case "DRIVE": return "bg-blue-50 text-blue-600 border-blue-100";
            case "CANDIDATE": return "bg-emerald-50 text-emerald-600 border-emerald-100";
            case "INTERVIEW": return "bg-purple-50 text-purple-600 border-purple-100";
        }
    };

    const getActivityLabel = (type: Activity["type"]) => {
        switch (type) {
            case "ORG": return "New Organization";
            case "DRIVE": return "New Hiring Drive";
            case "CANDIDATE": return "Candidate Applied";
            case "INTERVIEW": return "Interview Completed";
        }
    };

    return (
        <section className="animate-fade-slide [animation-delay:500ms]">
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm h-full space-y-6 group hover:shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-500">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Recent Activity</h2>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Platform-wide events stream</p>
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400">
                        <Clock className="h-5 w-5" />
                    </div>
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="py-12 flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                        </div>
                    ) : activities.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No recent activity</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activities.map((activity, i) => (
                                <div 
                                    key={i} 
                                    className="flex items-center gap-4 p-4 rounded-2xl border border-gray-50 bg-gray-50/20 hover:bg-white hover:border-orange-100 hover:shadow-sm transition-all group/item"
                                >
                                    <div className={cn(
                                        "h-10 w-10 rounded-xl border flex items-center justify-center flex-shrink-0 group-hover/item:scale-110 transition-transform duration-300",
                                        getActivityColor(activity.type)
                                    )}>
                                        {getActivityIcon(activity.type)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{getActivityLabel(activity.type)}</p>
                                            <p className="text-[10px] font-bold text-gray-400 tabular-nums">
                                                {formatDistanceToNow(new Date(activity.at), { addSuffix: true })}
                                            </p>
                                        </div>
                                        <h4 className="text-sm font-bold text-gray-900 truncate group-hover/item:text-[#F97316] transition-colors">{activity.detail}</h4>
                                        {activity.org && (
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 line-clamp-1">
                                                at <span className="text-gray-600">{activity.org}</span>
                                            </p>
                                        )}
                                    </div>
                                    
                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover/item:text-[#F97316] group-hover/item:translate-x-0.5 transition-all" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
