export function getRangeStart(range: string, from?: string): Date {
    const now = new Date();
    if (range === "all") return new Date(0);
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (range === "week") {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
    }
    
    if (range === "custom" && from) return new Date(from);
    
    // Default: month
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function getRangeWindow(range: string, from?: string, to?: string): { start: Date; prevStart: Date; prevEnd: Date } {
    const now = new Date();

    if (range === "all") {
        return { 
            start: new Date(0), 
            prevStart: new Date(0), 
            prevEnd: new Date(0) 
        };
    }
    
    if (range === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 1);
        const prevEnd = new Date(start);
        return { start, prevStart, prevEnd };
    }
    
    if (range === "week") {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevEnd = new Date(start);
        return { start, prevStart, prevEnd };
    }
    
    if (range === "custom" && from && to) {
        const start = new Date(from);
        const end = new Date(to);
        const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const prevStart = new Date(start);
        prevStart.setDate(start.getDate() - diffDays);
        return { start, prevStart, prevEnd: new Date(start) };
    }
    
    // default: month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, prevStart, prevEnd };
}
