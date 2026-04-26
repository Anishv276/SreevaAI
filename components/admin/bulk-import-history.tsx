"use client";
import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface BulkImportRecord {
    id: string;
    driveId: string;
    driveName?: string;
    status: "PROCESSING" | "COMPLETED" | "FAILED";
    totalCount: number;
    processedCount: number;
    failedCount: number;
    errorMessage?: string;
    createdAt: Date;
    completedAt?: Date;
}

interface BulkImportHistoryProps {
    driveId?: string;
    limit?: number;
}

export function BulkImportHistory({ driveId, limit = 10 }: BulkImportHistoryProps) {
    const [records, setRecords] = useState<BulkImportRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setIsLoading(true);
                setError(null);

                let url = `/api/bulk-import/history?limit=${limit}`;
                if (driveId) url += `&driveId=${driveId}`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error("Failed to fetch history");
                }

                const data = await response.json();
                setRecords(data || []);
            } catch (err) {
                console.error("Error fetching bulk import history:", err);
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, [driveId, limit]);

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-white/40 animate-pulse border border-white/20" />
                ))}
            </div>
        );
    }

    if (error || records.length === 0) {
        return (
            <div className="text-center py-8 px-4 bg-white/20 rounded-lg border border-white/20">
                <p className="text-sm text-gray-500 font-medium">No import history yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Recent Imports</h3>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {records.length} imports
                </span>
            </div>

            <div className="border border-white/40 rounded-2xl overflow-hidden bg-white/40 backdrop-blur-xl shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="border-b border-white/40 hover:bg-transparent">
                            <TableHead className="h-12 text-[10px] font-black uppercase tracking-widest text-gray-600 bg-white/30 pl-6">
                                Date
                            </TableHead>
                            <TableHead className="h-12 text-[10px] font-black uppercase tracking-widest text-gray-600 bg-white/30">
                                Total
                            </TableHead>
                            <TableHead className="h-12 text-[10px] font-black uppercase tracking-widest text-gray-600 bg-white/30">
                                Processed
                            </TableHead>
                            <TableHead className="h-12 text-[10px] font-black uppercase tracking-widest text-gray-600 bg-white/30">
                                Status
                            </TableHead>
                            <TableHead className="h-12 text-[10px] font-black uppercase tracking-widest text-gray-600 bg-white/30 text-right pr-6">
                                Action
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {records.map((record) => (
                            <TableRow key={record.id} className="border-b border-white/20 hover:bg-white/30 transition-colors">
                                <TableCell className="py-4 pl-6">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-900">
                                            {new Date(record.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {new Date(record.createdAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4">
                                    <span className="text-sm font-bold text-gray-800 tabular-nums">
                                        {record.totalCount}
                                    </span>
                                </TableCell>
                                <TableCell className="py-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-gray-800 tabular-nums">
                                            {record.processedCount}
                                        </span>
                                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                                                style={{
                                                    width: `${record.totalCount > 0 ? (record.processedCount / record.totalCount) * 100 : 0}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4">
                                    {record.status === "COMPLETED" ? (
                                        <Badge className="bg-green-100 text-green-700 border-0 rounded-lg px-3 py-1 text-[10px] font-bold flex items-center gap-1.5 w-fit">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Completed
                                        </Badge>
                                    ) : record.status === "PROCESSING" ? (
                                        <Badge className="bg-blue-100 text-blue-700 border-0 rounded-lg px-3 py-1 text-[10px] font-bold flex items-center gap-1.5 w-fit">
                                            <Clock className="h-3 w-3 animate-spin" />
                                            Processing
                                        </Badge>
                                    ) : (
                                        <Badge className="bg-red-100 text-red-700 border-0 rounded-lg px-3 py-1 text-[10px] font-bold flex items-center gap-1.5 w-fit">
                                            <AlertCircle className="h-3 w-3" />
                                            Failed
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="py-4 pr-6 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <MoreHorizontal className="h-4 w-4 text-gray-500" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="rounded-lg">
                                            <DropdownMenuItem className="text-sm cursor-pointer">
                                                View Details
                                            </DropdownMenuItem>
                                            {record.status === "FAILED" && (
                                                <DropdownMenuItem className="text-sm cursor-pointer text-amber-600">
                                                    Retry Import
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
