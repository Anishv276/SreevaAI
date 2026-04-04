"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Filter, MoreHorizontal, Eye, Download, ChevronLeft, ChevronRight, SlidersHorizontal, Trash2, X, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useCandidates } from "@/context/candidates-context";

export default function CandidatesPage() {
    const { candidates, bulkDeleteCandidates } = useCandidates();
    const [searchTerm, setSearchTerm] = useState("");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [resendingId, setResendingId] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const driveId = searchParams.get("driveId");

    const handleResendInterview = async (applicationId: string) => {
        setResendingId(applicationId);
        try {
            const res = await fetch(`/api/candidates/${applicationId}/resend-interview`, {
                method: "POST",
            });
            const data = await res.json();
            if (res.ok) {
                alert("Interview link resent successfully! New email sent.");
            } else {
                alert(data.error || "Failed to resend interview link");
            }
        } catch (error) {
            alert("Failed to resend interview link");
        } finally {
            setResendingId(null);
        }
    };

    const filteredCandidates = candidates.filter(candidate => {
        const matchesSearch = candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            candidate.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
            candidate.email.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesDrive = driveId ? candidate.driveId?.toString() === driveId : true;

        return matchesSearch && matchesDrive;
    });

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredCandidates.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredCandidates.map(c => c.id)));
        }
    };

    const handleDelete = async () => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            return;
        }

        if (selectedIds.size === 0) {
            setIsSelectionMode(false);
            return;
        }

        if (confirm(`Are you sure you want to delete ${selectedIds.size} candidates?`)) {
            try {
                await bulkDeleteCandidates(Array.from(selectedIds));
                setSelectedIds(new Set());
                setIsSelectionMode(false);
            } catch (error) {
                alert("Failed to delete candidates");
            }
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-in-fade">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Candidates
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">
                            Talent pool · {candidates.length} applicants
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        variant={isSelectionMode ? "destructive" : "outline"}
                        onClick={handleDelete}
                        className={cn(
                            "h-11 px-6 rounded-xl font-bold transition-all flex items-center gap-2",
                            !isSelectionMode && "border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-100"
                        )}
                    >
                        {isSelectionMode ? (
                            selectedIds.size > 0 ? `Confirm Delete (${selectedIds.size})` : "Cancel Selection"
                        ) : (
                            <><Trash2 className="h-4 w-4" /> Delete Candidates</>
                        )}
                    </Button>
                    {isSelectionMode && (
                        <Button 
                            variant="ghost" 
                            onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                            className="h-11 px-4 rounded-xl text-gray-500 font-bold hover:bg-gray-100"
                        >
                            <X className="h-4 w-4 mr-2" /> Cancel
                        </Button>
                    )}
                    <Button variant="outline" className="h-11 px-6 rounded-xl border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all">
                        <Download className="h-4 w-4 mr-2" /> Export
                    </Button>
                </div>
            </div>

            <div className="group relative bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-500">
                {/* Decorative top accent */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400/20 via-[#F97316]/40 to-orange-400/20" />
                <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row gap-6 justify-between items-center bg-white/50">
                    <div className="relative w-full sm:max-w-lg group/search">
                        <Search className="absolute left-4 top-3 h-4 w-4 text-gray-400 group-focus-within/search:text-[#F97316] transition-colors" />
                        <Input
                            placeholder="Search by name, role, or email..."
                            className="pl-11 h-11 border-gray-100 bg-gray-50/50 rounded-xl focus:bg-white focus:border-orange-100 focus:ring-4 focus:ring-orange-50/50 transition-all font-bold text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Button variant="outline" size="sm" className="gap-2 h-10 px-4 border-dashed rounded-lg border-gray-200 text-gray-400 font-bold hover:text-[#F97316] hover:border-orange-200 transition-all">
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Status
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2 h-10 px-4 border-dashed rounded-lg border-gray-200 text-gray-400 font-bold hover:text-[#F97316] hover:border-orange-200 transition-all">
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Role
                        </Button>
                    </div>
                </div>

                <div className="relative w-full overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-50 hover:bg-transparent">
                                {isSelectionMode && (
                                    <TableHead className="w-[50px] pl-8">
                                        <Checkbox 
                                            checked={selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                )}
                                <TableHead className={cn("w-[280px] h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400", !isSelectionMode && "pl-8")}>Candidate</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Applied For</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">AI Score</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Status</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Interview Status</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Applied Date</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCandidates.map((candidate) => (
                                (() => {
                                    const mainStatus =
                                        candidate.status === "Rejected"
                                            ? "Rejected"
                                            : candidate.status === "Borderline"
                                                ? "Borderline"
                                                : "Shortlisted";
                                    const interviewStage = candidate.interviewStatus || "Not Selected";

                                    return (
                                <TableRow 
                                    key={candidate.id} 
                                    onClick={() => isSelectionMode && toggleSelection(candidate.id)}
                                    className={cn(
                                        "group border-b border-gray-50/50 hover:bg-orange-50/30 transition-all duration-300",
                                        isSelectionMode && "cursor-pointer",
                                        selectedIds.has(candidate.id) && "bg-orange-50/50"
                                    )}
                                >
                                    {isSelectionMode && (
                                        <TableCell className="pl-8 py-5">
                                            <Checkbox 
                                                checked={selectedIds.has(candidate.id)}
                                                onCheckedChange={() => toggleSelection(candidate.id)}
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell className={cn("py-5", !isSelectionMode && "pl-8")}>
                                        <div className="flex items-center gap-4">
                                            <div className="relative group/avatar">
                                                <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100 group-hover/avatar:scale-105 transition-transform duration-300">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${candidate.name}`} />
                                                    <AvatarFallback>{candidate.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-gray-900 font-extrabold text-[15px] leading-tight group-hover:text-[#F97316] transition-colors">{candidate.name}</span>
                                                <span className="text-[11px] text-gray-400 font-bold mt-0.5">{candidate.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-700">{candidate.role}</span>
                                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">{candidate.location}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 shadow-sm">
                                                <span className={cn(
                                                    "text-sm font-black transition-colors",
                                                    candidate.score >= 80 ? "text-green-600" : candidate.score >= 50 ? "text-orange-600" : "text-red-500"
                                                )}>
                                                    {candidate.score}
                                                </span>
                                            </div>
                                            <div className="h-1 w-12 rounded-full bg-gray-100 overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full transition-all duration-700",
                                                        candidate.score >= 80 ? "bg-green-500 shadow-[0_0_8px_#22C55E]" : candidate.score >= 50 ? "bg-orange-500 shadow-[0_0_8px_#F97316]" : "bg-red-500 shadow-[0_0_8px_#EF4444]"
                                                    )}
                                                    style={{ width: `${candidate.score}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <Badge variant="secondary" className={cn(
                                            "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm",
                                            mainStatus === 'Shortlisted' ? 'bg-green-50 text-green-700' :
                                                mainStatus === 'Rejected' ? 'bg-red-50 text-red-700' :
                                                    'bg-amber-50 text-amber-700'
                                        )}>
                                            {mainStatus}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <p className="text-[11px] font-bold text-gray-500">
                                            {interviewStage}
                                        </p>
                                    </TableCell>
                                    <TableCell className="py-5 text-[12px] font-bold text-gray-400">
                                        {candidate.date}
                                    </TableCell>
                                    <TableCell className="py-5 pr-8 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <Link href={`/admin/candidates/${candidate.id}`} onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    className="h-9 px-4 rounded-lg text-[#F97316] font-extrabold hover:bg-orange-50 transition-all"
                                                >
                                                    View Profile
                                                </Button>
                                            </Link>
                                            <div onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                            <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border-gray-100">
                                                        <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Quick Actions</DropdownMenuLabel>
                                                        {(candidate.status === "Shortlisted") && (
                                                            <DropdownMenuItem 
                                                                onClick={() => handleResendInterview(candidate.id)}
                                                                disabled={resendingId === candidate.id}
                                                                className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors"
                                                            >
                                                                <RefreshCw className={cn("h-4 w-4 mr-2", resendingId === candidate.id && "animate-spin")} />
                                                                {resendingId === candidate.id ? "Sending..." : "Resend Interview Link"}
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator className="my-1 bg-gray-50" />
                                                        <DropdownMenuItem className="rounded-lg px-3 py-2 font-bold text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50 transition-colors">Reject Candidate</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                    );
                                })()
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="px-8 py-6 border-t border-gray-50 flex items-center justify-between bg-gray-50/30">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Showing <span className="text-gray-900">{filteredCandidates.length}</span> of <span className="text-gray-900">{candidates.length}</span> candidates
                </p>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-gray-200 text-gray-400 font-bold hover:text-gray-600 transition-all" disabled>
                        <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                    </Button>
                    <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-gray-200 text-gray-400 font-bold hover:text-gray-600 transition-all" disabled>
                        Next <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
