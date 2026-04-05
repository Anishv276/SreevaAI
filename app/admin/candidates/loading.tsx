import { Skeleton } from "@/components/ui/skeleton";

export default function CandidatesLoading() {
    return (
        <div className="space-y-8 pb-12 animate-in-fade">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-14 w-1.5 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-48" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="flex gap-3">
                    <Skeleton className="h-11 w-40 rounded-xl" />
                    <Skeleton className="h-11 w-32 rounded-xl" />
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row gap-6 justify-between items-center bg-white/50">
                    <Skeleton className="h-11 w-full sm:max-w-lg rounded-xl" />
                    <div className="flex gap-3">
                        <Skeleton className="h-10 w-24 rounded-lg" />
                        <Skeleton className="h-10 w-24 rounded-lg" />
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-11 w-11 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
