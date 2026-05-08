import { Search } from "lucide-react";

export function Header() {
    return (
        <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-white/50 px-6 backdrop-blur-xl">
            <div className="flex flex-1 items-center gap-4">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <input
                        type="search"
                        placeholder="Search jobs, candidates..."
                        className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
            </div>
        </header>
    );
}

