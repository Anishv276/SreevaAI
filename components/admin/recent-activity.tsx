import { cn } from "@/lib/utils";
import { UserPlus, FileCheck, Calendar, XCircle, ChevronRight } from "lucide-react";

const activities = [
    {
        id: 1,
        action: "15 new applications",
        drive: "Backend Engineer",
        time: "2m ago",
        icon: UserPlus,
        color: "bg-[#FFF4ED] text-[#F97316]",
    },
    {
        id: 2,
        action: "AI interview completed · Score 87%",
        drive: "Product Designer",
        time: "1h ago",
        icon: FileCheck,
        color: "bg-green-50 text-green-600",
    },
    {
        id: 3,
        action: "Interview scheduled",
        drive: "Senior Frontend Engineer",
        time: "3h ago",
        icon: Calendar,
        color: "bg-blue-50 text-blue-600",
    },
    {
        id: 4,
        action: "AI screening done for 8 candidates",
        drive: "Data Analyst",
        time: "5h ago",
        icon: FileCheck,
        color: "bg-green-50 text-green-600",
    },
    {
        id: 5,
        action: "12 rejection emails sent",
        drive: "Backend Engineer",
        time: "1d ago",
        icon: XCircle,
        color: "bg-red-50 text-red-500",
    },
];

export function RecentActivity() {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h2 className="text-[15px] font-semibold text-[#111827]">Recent Activity</h2>
                <p className="text-[12px] text-[#6B7280] mt-0.5">Latest updates across your jobs</p>
            </div>

            {/* Feed card */}
            <div className="bg-white border border-[#EAEAEA] rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                <div className="divide-y divide-[#F3F4F6]">
                    {activities.map((activity) => {
                        const Icon = activity.icon;
                        return (
                            <div
                                key={activity.id}
                                className="flex items-start gap-3 px-4 py-3.5 hover:bg-[#FAFAFA] transition-colors duration-150"
                            >
                                {/* Icon badge */}
                                <div className={cn("h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", activity.color)}>
                                    <Icon className="h-3.5 w-3.5" />
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-[#111827] leading-snug">
                                        {activity.action}
                                    </p>
                                    <p className="text-[11.5px] text-[#6B7280] mt-0.5 truncate">{activity.drive}</p>
                                </div>

                                {/* Time */}
                                <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap flex-shrink-0 mt-0.5">
                                    {activity.time}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Footer link */}
                <div className="px-4 py-3 border-t border-[#F3F4F6] bg-[#FAFAFA]">
                    <button className="text-[12.5px] font-medium text-[#F97316] hover:text-orange-600 flex items-center gap-1 w-full justify-center transition-colors cursor-pointer">
                        View All Activity <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

