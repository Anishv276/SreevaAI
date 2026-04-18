"use client";

import { Clock, ArrowRight, Calendar } from "lucide-react";
import Link from "next/link";

const actions = [
    {
        id: 1,
        text: "Review 5 AI-scored candidates",
        sub: "Backend Engineer",
        buttonLabel: "Review",
        buttonColor: "bg-[#F97316] hover:bg-orange-500 text-white",
        href: "/admin/candidates",
    },
    {
        id: 2,
        text: "Drive closing in 5 days",
        sub: "Product Designer",
        buttonLabel: "Extend or Close",
        buttonColor: "bg-[#2563EB] hover:bg-blue-600 text-white",
        href: "/admin/drives",
    },
    {
        id: 3,
        text: "Interview feedback pending",
        sub: "2 managers haven't responded",
        buttonLabel: "Send Reminder",
        buttonColor: "bg-white border border-[#EAEAEA] hover:bg-[#F9FAFB] text-[#374151]",
        href: "/admin/drives",
    },
];

export function ActionRequired() {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-semibold text-[#111827]">Action Required</h2>
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#F97316] text-white text-[10px] font-bold">
                    {actions.length}
                </span>
            </div>

            {/* Action cards */}
            <div className="bg-white border border-[#EAEAEA] rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                {actions.length === 0 ? (
                    <div className="px-5 py-6 text-center">
                        <p className="text-[14px] font-medium text-green-600">You&apos;re all caught up ðŸŽ‰</p>
                        <p className="text-[12px] text-[#6B7280] mt-1">Nothing needs your attention right now.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[#F3F4F6]">
                        {actions.map((action) => (
                            <div
                                key={action.id}
                                className="flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAFA] transition-colors duration-150"
                            >
                                {/* Icon */}
                                <div className="h-8 w-8 rounded-full bg-[#FFF4ED] flex items-center justify-center flex-shrink-0">
                                    {action.id === 2 ? (
                                        <Calendar className="h-3.5 w-3.5 text-[#F97316]" />
                                    ) : (
                                        <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                                    )}
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-[#111827] leading-snug">{action.text}</p>
                                    <p className="text-[11.5px] text-[#6B7280] mt-0.5 truncate">{action.sub}</p>
                                </div>

                                {/* Button */}
                                <Link href={action.href}>
                                    <button
                                        className={`flex-shrink-0 text-[11.5px] font-medium rounded-lg px-3 py-1.5 transition-all duration-150 cursor-pointer whitespace-nowrap ${action.buttonColor}`}
                                    >
                                        {action.buttonLabel}
                                    </button>
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

