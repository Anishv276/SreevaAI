"use client";

import { PortalHeader } from "@/components/careers/portal-header";
import { JobCard } from "@/components/careers/job-card";
import { useJobs } from "@/context/jobs-context";
import { Input } from "@/components/ui/input";
import { Search, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useState, useMemo, useRef, useEffect } from "react";

export default function PortalPage() {
    const { jobs } = useJobs();
    const [searchQuery, setSearchQuery] = useState("");
    const [locationQuery, setLocationQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("All Jobs");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const locationRef = useRef<HTMLDivElement>(null);

    // Extract unique locations from current jobs
    const uniqueLocations = useMemo(() => {
        const locations = jobs.map(j => (j as any).workMode).filter(Boolean);
        return Array.from(new Set(locations)).sort();
    }, [jobs]);

    const filteredLocations = useMemo(() => {
        if (!locationQuery) return uniqueLocations;
        const query = locationQuery.toLowerCase();
        return uniqueLocations
            .filter(loc => loc.toLowerCase().includes(query))
            .sort((a, b) => {
                const aStarts = a.toLowerCase().startsWith(query);
                const bStarts = b.toLowerCase().startsWith(query);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return a.localeCompare(b);
            });
    }, [uniqueLocations, locationQuery]);

    // Handle clicking outside of the location suggestions
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (locationRef.current && !locationRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 job.department.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesLocation = ((job as any).workMode || "").toLowerCase().includes(locationQuery.toLowerCase());
            const matchesCategory = activeCategory === "All Jobs" || 
                                   job.department.toLowerCase() === activeCategory.toLowerCase();
            
            return matchesSearch && matchesLocation && matchesCategory;
        });
    }, [jobs, searchQuery, locationQuery, activeCategory]);

    return (
        <div className="min-h-screen bg-[#FDFCFB] selection:bg-orange-100 selection:text-orange-900">
            <PortalHeader />

            {/* Premium Hero Section */}
            <div className="relative overflow-hidden bg-white border-b border-orange-100/30 pt-24 pb-32 px-6">
                {/* Decorative Background Elements */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gradient-to-br from-orange-50 to-transparent rounded-full blur-3xl opacity-40" />
                    <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-gradient-to-tl from-orange-50 to-transparent rounded-full blur-3xl opacity-30" />
                </div>

                <div className="container mx-auto max-w-5xl relative z-10 text-center space-y-12 animate-in-fade">
                    <div className="space-y-6">
                        <div className="inline-flex px-4 py-2 rounded-full bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] border border-orange-100 shadow-[0_5px_15px_rgba(249,115,22,0.1)]">
                            WE ARE HIRING
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black tracking-tight text-gray-900 leading-[1.05]">
                            Empowering the next <br />
                            generation of <span className="text-[#F97316]">talent.</span>
                        </h1>
                        <p className="text-xl text-gray-500 font-medium max-w-2xl mx-auto leading-relaxed">
                            Find your next career move with Lumoscale. We build the future of AI-driven recruitment and we want you to be part of it.
                        </p>
                    </div>

                    {/* Glassmorphic Search Bar */}
                    <div className="flex flex-col md:flex-row gap-0 p-2 bg-white/70 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.12)] border border-white max-w-4xl mx-auto group text-left">
                        <div className="flex-1 flex items-center px-8 gap-4 border-b md:border-b-0 md:border-r border-gray-100 transition-colors focus-within:bg-gray-50/50 rounded-t-[2.5rem] md:rounded-tr-none md:rounded-l-[2.5rem]">
                            <Search className="h-5 w-5 text-[#F97316]" />
                            <input
                                className="w-full h-16 bg-transparent outline-none text-base font-bold text-gray-900 placeholder:text-gray-300"
                                placeholder="Search by job title, skills, or department..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 flex items-center px-8 gap-4 transition-colors focus-within:bg-gray-50/50 relative" ref={locationRef}>
                            <MapPin className="h-5 w-5 text-[#F97316]" />
                            <input
                                className="w-full h-16 bg-transparent outline-none text-base font-bold text-gray-900 placeholder:text-gray-300"
                                placeholder="Location or Remote"
                                value={locationQuery}
                                onChange={(e) => {
                                    setLocationQuery(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                            />

                            {/* Location Suggestions Dropdown */}
                            {showSuggestions && filteredLocations.length > 0 && (
                                <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-orange-100/50 p-3 z-50 animate-in-up duration-300 overflow-hidden">
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        <p className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Suggestions</p>
                                        {filteredLocations.map((loc) => (
                                            <button
                                                key={loc}
                                                onClick={() => {
                                                    setLocationQuery(loc);
                                                    setShowSuggestions(false);
                                                }}
                                                className="w-full text-left px-5 py-3.5 rounded-2xl hover:bg-orange-50 hover:text-[#F97316] transition-all text-sm font-bold text-gray-700 flex items-center justify-between group"
                                            >
                                                {loc}
                                                <div className="h-2 w-2 rounded-full bg-[#F97316] opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-1">
                            <Button className="h-14 px-10 rounded-[2rem] bg-gray-900 hover:bg-black text-white font-black text-base shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                                FIND JOBS
                            </Button>
                        </div>
                    </div>

                    {/* Quick Filters / Categories */}
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                        {["All Jobs", "Engineering", "Design", "Product", "Sales", "Operations"].map((cat) => (
                            <button 
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-5 py-2.5 rounded-2xl text-[13px] font-black transition-all border ${
                                    activeCategory === cat ? "bg-[#F97316] border-[#F97316] text-white shadow-lg shadow-orange-500/20" : "bg-white border-gray-100 text-gray-500 hover:border-orange-200 hover:text-[#F97316] shadow-sm"
                                }`}
                            >
                                {cat.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Jobs Grid Section */}
            <div className="container mx-auto px-6 py-24 max-w-7xl">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16 px-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <span className="h-10 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Open Opportunities</h2>
                        </div>
                        <p className="text-gray-500 font-bold uppercase tracking-[0.2em] text-[11px] ml-6">
                            Showing {filteredJobs.length} roles matching your profile
                        </p>
                    </div>
                </div>

                <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
                    {filteredJobs.map((drive) => (
                        <JobCard key={drive.id} job={drive} />
                    ))}

                    {filteredJobs.length === 0 && (
                        <div className="col-span-full py-20 text-center space-y-4 bg-white rounded-[3rem] border border-dashed border-gray-200">
                            <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                                <Search className="h-8 w-8 text-gray-300" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">No positions found</h3>
                            <p className="text-gray-500 max-w-xs mx-auto">Try adjusting your search or filters to find what you're looking for.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
