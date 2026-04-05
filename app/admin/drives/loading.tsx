import { Skeleton } from "@/components/ui/skeleton";

export default function DrivesLoading() {
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
                <Skeleton className="h-12 w-48 rounded-xl" />
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 p-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-white rounded-[2.5rem] border border-gray-100 p-8 space-y-6 shadow-sm">
                        <div className="flex justify-between items-start">
                            <Skeleton className="h-12 w-12 rounded-2xl" />
                            <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                        <div className="space-y-3">
                            <Skeleton className="h-8 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                        <div className="flex justify-between items-center py-4 border-t border-gray-50">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-20" />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Skeleton className="h-12 flex-1 rounded-2xl" />
                            <Skeleton className="h-12 w-12 rounded-2xl" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
