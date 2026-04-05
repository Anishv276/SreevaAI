"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Search,
    Filter,
    MoreHorizontal,
    Plus,
    Briefcase,
    Users,
    Calendar,
    Trash2,
    Edit,
    Eye,
    Loader2,
    ChevronRight,
    X,
    ExternalLink,
    Copy,
    CheckCircle2,
    DollarSign,
    Clock,
    MapPin,
    AlertCircle,
    FileText,
    Share2
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useJobs } from "@/context/jobs-context";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";

export default function DrivesPage() {
    const router = useRouter();
    const { jobs, pagination, deleteJob, fetchJobs, toggleDriveStatus, bulkDeleteJobs } = useJobs();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    
    // Filters State
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    
    // Detailed View State
    const [previewDriveId, setPreviewDriveId] = useState<number | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    
    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [driveToDelete, setDriveToDelete] = useState<number | null>(null);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const selectedDrive = jobs.find(j => j.id === previewDriveId);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setIsLoading(true);
            fetchJobs(newPage, pagination.limit).finally(() => setIsLoading(false));
        }
    };

    // Initial load
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            await fetchJobs(pagination.page, pagination.limit);
            setIsLoading(false);
        };
        load();
    }, []);

    const handleDelete = async (id: number) => {
        setDriveToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!driveToDelete) return;
        setIsDeleting(true);
        try {
            await deleteJob(driveToDelete);
            setIsDeleteModalOpen(false);
            setDriveToDelete(null);
        } catch (error) {
            console.error("Error deleting drive:", error);
            alert("Failed to delete drive");
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredDrives = jobs.filter(drive => {
        const matchesSearch = drive.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            drive.department.toLowerCase().includes(searchQuery.toLowerCase());
        
        // Status logic
        const matchesStatus = statusFilter === "all" || (statusFilter === "active"); 
        
        // Safety check for optional type field
        const matchesType = typeFilter === "all" || 
            (drive.type && drive.type.toLowerCase() === typeFilter.toLowerCase());
        
        return matchesSearch && matchesStatus && matchesType;
    });

    const toggleSelection = (id: number) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBulkDelete = async () => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            return;
        }

        if (selectedIds.size === 0) {
            setIsSelectionMode(false);
            return;
        }

        setIsBulkDeleteModalOpen(true);
    };

    const confirmBulkDelete = async () => {
        setIsDeleting(true);
        try {
            await bulkDeleteJobs(Array.from(selectedIds));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            setIsBulkDeleteModalOpen(false);
        } catch (error) {
            alert("Failed to delete drives");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-in-fade">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Recruitment Drives
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base sm:text-lg">
                            Manage your hiring drives and view their status.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 mb-1">
                    <Button 
                        variant={isSelectionMode ? "destructive" : "outline"}
                        onClick={handleBulkDelete}
                        className={cn(
                            "h-11 px-6 rounded-xl font-bold transition-all flex items-center gap-2",
                            !isSelectionMode && "border-red-100 text-red-600 hover:bg-red-50"
                        )}
                    >
                        {isSelectionMode ? (
                            selectedIds.size > 0 ? `Confirm Delete (${selectedIds.size})` : "Cancel Selection"
                        ) : (
                            <><Trash2 className="h-5 w-5 mr-2 text-red-500" /> Delete Drives</>
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
                    <Link href="/admin/create-drive">
                        <Button className="bg-gradient-to-r from-[#F97316] to-orange-500 hover:from-orange-600 hover:to-orange-500 text-white shadow-lg hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-200 h-11 px-6 font-semibold rounded-xl">
                            <Plus className="h-5 w-5 mr-2" /> Create New Drive
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border shadow-sm">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search drives..."
                        className="pl-10 bg-gray-50 border-gray-200"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {/* Status Select */}
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-10 px-4 border-dashed rounded-xl border-gray-200 text-gray-400 font-bold hover:text-green-600 hover:border-green-200 transition-all bg-transparent w-[140px]">
                            <div className="flex items-center gap-2">
                                <Filter className="h-3.5 w-3.5" />
                                <SelectValue placeholder="Status" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-gray-100 shadow-xl p-1">
                            <SelectItem value="all" className="rounded-lg py-2 font-bold text-[11px] uppercase tracking-widest">All Status</SelectItem>
                            <SelectItem value="active" className="rounded-lg py-2 font-bold text-[11px] uppercase tracking-widest text-green-600">
                                Active
                            </SelectItem>
                            <SelectItem value="inactive" className="rounded-lg py-2 font-bold text-[11px] uppercase tracking-widest text-gray-400">Inactive</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Type Select */}
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="h-10 px-4 border-dashed rounded-xl border-gray-200 text-gray-400 font-bold hover:text-[#F97316] hover:border-orange-200 transition-all bg-transparent w-[160px]">
                            <div className="flex items-center gap-2">
                                <Briefcase className="h-3.5 w-3.5" />
                                <SelectValue placeholder="Job Type" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-gray-100 shadow-xl p-1">
                            <SelectItem value="all" className="rounded-lg py-2 font-bold text-[11px] uppercase tracking-widest">All Types</SelectItem>
                            <SelectItem value="full-time" className="rounded-lg py-2 font-bold text-[11px] uppercase tracking-widest">Full-time</SelectItem>
                            <SelectItem value="internship" className="rounded-lg py-2 font-bold text-[11px] uppercase tracking-widest">Internship</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Drives Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="h-64 animate-pulse bg-gray-50 border-gray-100" />
                    ))}
                </div>
            ) : filteredDrives.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Briefcase className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">No drives found</h3>
                    <p className="text-gray-500 mt-1">Get started by creating a new recruitment drive.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredDrives.map((drive) => (
                            <Card 
                                key={drive.id} 
                                onClick={() => isSelectionMode && toggleSelection(drive.id)}
                                className={cn(
                                    "group relative bg-white/90 backdrop-blur-sm border-gray-100 hover:border-orange-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] transition-all duration-500 rounded-2xl overflow-hidden",
                                    isSelectionMode ? "cursor-pointer" : "cursor-default",
                                    selectedIds.has(drive.id) && "ring-2 ring-[#F97316] border-[#F97316]/50 bg-orange-50/30"
                                )}
                            >
                                {/* ... Card content remains the same ... */}
                                {isSelectionMode && (
                                    <div className="absolute top-4 left-4 z-20">
                                        <Checkbox 
                                            checked={selectedIds.has(drive.id)}
                                            onCheckedChange={() => toggleSelection(drive.id)}
                                            className="h-6 w-6 border-2 border-[#F97316] bg-white rounded-lg shadow-sm"
                                        />
                                    </div>
                                )}
                                {/* Animated Background Accent */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-100/20 to-transparent rounded-full -mr-12 -mt-12 transition-transform duration-700 group-hover:scale-150" />
                                
                                <CardHeader className="pb-4 pt-6 px-6 relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-50 to-white flex items-center justify-center text-[#F97316] shadow-[0_4px_12px_rgba(249,115,22,0.1)] border border-orange-100 group-hover:rotate-6 group-hover:scale-110 transition-all duration-300">
                                            <Briefcase className="h-7 w-7" />
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-10 w-10 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-orange-50/50 rounded-xl transition-colors">
                                                    <MoreHorizontal className="h-5 w-5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl border-gray-100 shadow-xl">
                                                <Link href={`/admin/candidates?driveId=${drive.id}`}>
                                                    <DropdownMenuItem className="cursor-pointer rounded-lg py-2.5 focus:bg-orange-50 focus:text-orange-700">
                                                        <Eye className="mr-2 h-4 w-4" /> View Applicants
                                                    </DropdownMenuItem>
                                                </Link>
                                                <DropdownMenuItem
                                                    className="cursor-pointer rounded-lg py-2.5 focus:bg-orange-50 focus:text-orange-700"
                                                    onClick={() => router.push(`/admin/create-drive?id=${drive.id}`)}
                                                >
                                                    <Edit className="mr-2 h-4 w-4" /> Edit Drive Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer rounded-lg py-2.5"
                                                    onClick={() => handleDelete(drive.id)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Drive
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <div className="space-y-2">
                                        <h3 
                                            className="font-extrabold text-gray-900 text-xl tracking-tight leading-tight cursor-pointer hover:text-[#F97316] transition-colors"
                                            onClick={() => router.push(`/admin/candidates?driveId=${drive.id}`)}
                                        >
                                            {drive.title}
                                        </h3>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            <div className="px-3 py-1 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-bold uppercase tracking-wider border border-gray-100/50">
                                                {drive.department}
                                            </div>
                                            <div className="px-3 py-1 rounded-lg bg-orange-50/30 text-[#F97316] text-[11px] font-bold uppercase tracking-wider border border-orange-100/30">
                                                {drive.type}
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="px-6 py-4 relative z-10">
                                    <div 
                                        className="flex items-center justify-between p-3.5 bg-gray-50/50 rounded-2xl border border-gray-100/50 group-hover:bg-white transition-colors duration-500"
                                        onClick={(e) => isSelectionMode && e.stopPropagation()}
                                    >
                                        {/* Toggle Switch */}
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse" />
                                            <span className="text-[11px] font-black uppercase tracking-wider text-green-600">
                                                Active
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                <Calendar className="h-3 w-3" />
                                                Posted
                                            </div>
                                            <div className="text-[13px] font-bold text-gray-700">
                                                {new Date(drive.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>

                                <CardFooter className="px-6 pb-6 pt-2 flex items-center justify-between relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316] shadow-sm border border-orange-100/50">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-base font-black text-gray-900 leading-none">{drive.applicants || 0}</span>
                                            <span className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">Candidates</span>
                                        </div>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        className="h-11 px-4 rounded-xl text-[#F97316] hover:text-white hover:bg-[#F97316] font-bold text-xs gap-2 group/btn transition-all duration-300 shadow-sm hover:shadow-[0_4px_15px_rgba(249,115,22,0.3)] border border-orange-100/50 hover:border-transparent"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isSelectionMode) return;
                                            setPreviewDriveId(drive.id);
                                        }}
                                    >
                                        View Details 
                                        <ChevronRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>

                    {/* Pagination Footer */}
                    <div className="flex items-center justify-between py-10 border-t border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            Showing <span className="text-gray-900">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900">{pagination.total}</span> drives
                        </p>
                        <div className="flex gap-3">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-11 px-6 rounded-xl border-gray-200 text-gray-500 font-bold hover:bg-gray-50 disabled:opacity-30 transition-all"
                                disabled={pagination.page <= 1 || isLoading}
                                onClick={() => handlePageChange(pagination.page - 1)}
                            >
                                <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Previous
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-11 px-6 rounded-xl border-gray-200 text-gray-500 font-bold hover:bg-gray-50 disabled:opacity-30 transition-all"
                                disabled={pagination.page >= pagination.totalPages || isLoading}
                                onClick={() => handlePageChange(pagination.page + 1)}
                            >
                                Next <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Job Details Slide-over */}
            {selectedDrive && (
                <>
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300"
                        onClick={() => setPreviewDriveId(null)}
                    />
                    <div 
                        className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-white shadow-[0_0_60px_rgba(0,0,0,0.1)] z-[101] transform transition-transform duration-500 ease-out border-l border-gray-100 flex flex-col"
                        style={{ transform: previewDriveId ? 'translateX(0)' : 'translateX(100%)' }}
                    >
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-[#F97316]">
                                    <Briefcase className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-extrabold text-gray-900 leading-tight">Job Details</h2>
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Admin Preview</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setPreviewDriveId(null)}
                                className="h-10 w-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                            {/* Title Section */}
                            <div className="space-y-4">
                                <h1 className="text-3xl font-black text-gray-900 leading-tight">{selectedDrive.title}</h1>
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="px-3 py-1 bg-orange-50 text-[#F97316] border-0 font-bold uppercase text-[10px] tracking-widest">{selectedDrive.department}</Badge>
                                    <Badge variant="secondary" className="px-3 py-1 bg-gray-100 text-gray-600 border-0 font-bold uppercase text-[10px] tracking-widest">{selectedDrive.type}</Badge>
                                    <Badge variant="secondary" className="px-3 py-1 bg-green-50 text-green-600 border-0 font-bold uppercase text-[10px] tracking-widest flex items-center gap-1.5 leading-none h-6 px-2.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        Active
                                    </Badge>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group/grid">
                                <div className="absolute inset-0 bg-gradient-to-br from-orange-50/0 via-orange-50/0 to-orange-100/30 opacity-0 group-hover/grid:opacity-100 transition-opacity duration-700" />
                                
                                <div className="space-y-1.5 relative z-10">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                                        <DollarSign className="h-3 w-3" /> Salary
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">{(selectedDrive as any).salary || "As per policy"}</p>
                                </div>
                                <div className="space-y-1.5 relative z-10">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                                        <Clock className="h-3 w-3" /> Experience
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">{(selectedDrive as any).experience || "Not specified"}</p>
                                </div>
                                <div className="space-y-1.5 relative z-10">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                                        <Calendar className="h-3 w-3" /> Posted On
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">{new Date(selectedDrive.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>

                            {/* Kiosk link Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                    <Share2 className="h-3.5 w-3.5 text-[#F97316]" /> Kiosk Link
                                </div>
                                <div className="group/link relative p-4 rounded-2xl bg-[#F97316]/[0.03] border-2 border-dashed border-orange-100 hover:border-orange-200 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 font-mono text-xs text-orange-700 break-all select-all pr-12">
                                            {`${typeof window !== 'undefined' ? window.location.origin : ''}/careers/jobs/${selectedDrive.id}`}
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const link = `${window.location.origin}/careers/jobs/${selectedDrive.id}`;
                                                navigator.clipboard.writeText(link);
                                                setCopySuccess(true);
                                                setTimeout(() => setCopySuccess(false), 2000);
                                            }}
                                            className="absolute right-4 p-2.5 rounded-xl bg-white border border-orange-100 shadow-sm text-[#F97316] hover:bg-[#F97316] hover:text-white hover:shadow-orange-500/20 active:scale-95 transition-all"
                                        >
                                            {copySuccess ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Job Brief */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                    <FileText className="h-3.5 w-3.5" /> Job Brief
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed font-medium">
                                    {selectedDrive.description}
                                </p>
                            </div>

                            {/* Detailed Points */}
                            <div className="grid grid-cols-1 gap-8">
                                {(selectedDrive as any).skills && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Required Skills</div>
                                        <div className="flex flex-wrap gap-2">
                                            {(selectedDrive as any).skills.split(',').map((s: string, i: number) => (
                                                <Badge key={i} variant="outline" className="px-3 py-1.5 rounded-lg border-gray-100 font-bold text-gray-600 bg-gray-50/50">{s.trim()}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {(selectedDrive as any).responsibilities && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Responsibilities</div>
                                        <ul className="space-y-3">
                                            {(selectedDrive as any).responsibilities.split('\n').map((line: string, i: number) => line.trim() && (
                                                <li key={i} className="flex gap-3 text-sm text-gray-600 font-medium">
                                                    <div className="h-5 w-5 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                                                        <ChevronRight className="h-3 w-3 text-[#F97316]" />
                                                    </div>
                                                    {line.trim()}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Drawer Footer */}
                        <div className="p-6 border-t border-gray-50 flex gap-3 bg-white/50 backdrop-blur-md">
                            <Button 
                                className="flex-1 bg-gradient-to-r from-[#F97316] to-orange-500 hover:from-orange-600 hover:to-orange-500 text-white font-black uppercase text-[10px] tracking-[0.2em] h-12 shadow-lg shadow-orange-500/20"
                                onClick={() => router.push(`/admin/candidates?driveId=${selectedDrive.id}`)}
                            >
                                View Applicants ({selectedDrive.applicants || 0})
                            </Button>
                            <Button 
                                variant="outline" 
                                className="h-12 w-12 rounded-xl flex items-center justify-center p-0 border-gray-200 text-gray-400 hover:text-gray-900 overflow-hidden"
                                onClick={() => router.push(`/admin/create-drive?id=${selectedDrive.id}`)}
                            >
                                <Edit className="h-5 w-5" />
                            </Button>
                            <Button 
                                variant="outline" 
                                className="h-12 w-12 rounded-xl flex items-center justify-center p-0 border-orange-100 text-[#F97316] hover:bg-orange-50"
                                onClick={() => {
                                    const link = `${window.location.origin}/careers/jobs/${selectedDrive.id}`;
                                    window.open(link, '_blank');
                                }}
                            >
                                <ExternalLink className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Confirmation Modals */}
            <ActionConfirmModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Drive"
                description="Are you sure you want to delete this drive? This will permanently remove all candidates and data associated with it."
                confirmText="Confirm Delete"
                isLoading={isDeleting}
            />

            <ActionConfirmModal 
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={confirmBulkDelete}
                title="Bulk Delete Drives"
                description={`Are you sure you want to delete ${selectedIds.size} selected drives and all their associated data? This action cannot be undone.`}
                confirmText={`Delete ${selectedIds.size} Drives`}
                isLoading={isDeleting}
            />
        </div>
    );
}
