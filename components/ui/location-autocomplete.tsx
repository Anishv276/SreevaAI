"use client";
import { useState, useEffect, useRef } from "react";
import { MapPin as MapPinIcon, Loader2, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
interface LocationAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    icon?: React.ReactNode;
}
interface Suggestion {
    name: string;
    city?: string;
    state?: string;
    country: string;
    label: string;
}
export function LocationAutocomplete({ 
    value, 
    onChange, 
    placeholder = "Search location...", 
    className,
    icon 
}: LocationAutocompleteProps) {
    const [query, setQuery] = useState(value);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    // Update internal query when prop value changes (e.g. on initial load)
    useEffect(() => {
        setQuery(value);
    }, [value]);
    // Handle clicks outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    // Debounced search
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (query.length < 2 || !isOpen) {
                setSuggestions([]);
                return;
            }
            setIsLoading(true);
            try {
                const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
                if (res.ok) {
                    const data = await res.json();
                    const mapped: Suggestion[] = data.features.map((f: any) => {
                        const p = f.properties;
                        const parts = [p.name, p.city, p.state, p.country].filter(Boolean);
                        // Deduplicate (e.g. if name is same as city)
                        const uniqueParts = Array.from(new Set(parts));
                        return {
                            name: p.name,
                            city: p.city,
                            state: p.state,
                            country: p.country,
                            label: uniqueParts.join(", ")
                        };
                    });
                    setSuggestions(mapped);
                }
            } catch (err) {
                console.error("Location search failed:", err);
            } finally {
                setIsLoading(false);
            }
        };
        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [query, isOpen]);
    const handleSelect = (suggestion: Suggestion) => {
        setQuery(suggestion.label);
        onChange(suggestion.label);
        setIsOpen(false);
    };
    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            <div className="relative group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#F97316] transition-colors">
                    {icon || <MapPinIcon className="h-4 w-4" />}
                </div>
                <Input
                    className="pl-10 h-11 rounded-xl border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all shadow-sm"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        onChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F97316]" />}
                    {query && (
                        <button 
                            type="button"
                            onClick={() => { setQuery(""); onChange(""); }}
                            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
            <AnimatePresence>
                {isOpen && (suggestions.length > 0 || isLoading) && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 5, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-[100] w-full bg-white/80 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-2 overflow-hidden"
                    >
                        {isLoading && suggestions.length === 0 ? (
                            <div className="p-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">
                                Searching locations...
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={`${s.label}-${i}`}
                                        type="button"
                                        onClick={() => handleSelect(s)}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-orange-50 text-left transition-all group/item border border-transparent hover:border-orange-100 hover:shadow-sm"
                                    >
                                        <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover/item:bg-white group-hover/item:text-[#F97316] shadow-sm transition-colors">
                                            <Search className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[13px] font-bold text-gray-900 leading-tight">{s.name}</p>
                                            <p className="text-[10px] font-medium text-gray-500 mt-0.5 truncate max-w-[280px]">
                                                {[s.city, s.state, s.country].filter(Boolean).join(", ")}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
