"use client";



import { useState, useRef } from "react";

import { Upload, Loader2, FileText, X, CheckCircle2, PenLine, Eye, Search, ChevronDown } from "lucide-react";

import { createPortal } from "react-dom";

import { useEffect } from "react";
import { formatSalaryValue, splitSalaryValue } from "@/lib/salary-format";



const textareaClass =

    "w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] hover:border-orange-300 transition-all duration-200 resize-none overflow-y-auto";



const inputClass =

    "w-full h-11 rounded-lg border border-gray-200 bg-white px-4 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] hover:border-orange-300 transition-all duration-200";



function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {

    return (

        <label className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">

            {children}

            {required && <span className="text-[#F97316] font-black">*</span>}

        </label>

    );

}





const currencies = [

    { code: "INR", symbol: "₹", name: "Indian Rupee" },

    { code: "USD", symbol: "$", name: "US Dollar" },

    { code: "EUR", symbol: "€", name: "Euro" },

    { code: "GBP", symbol: "£", name: "British Pound" },

    { code: "AUD", symbol: "A$", name: "Australian Dollar" },

    { code: "CAD", symbol: "C$", name: "Canadian Dollar" },

    { code: "SGD", symbol: "S$", name: "Singapore Dollar" },

    { code: "AED", symbol: "د.إ", name: "UAE Dirham" },

    { code: "JPY", symbol: "¥", name: "Japanese Yen" },

    { code: "CNY", symbol: "¥", name: "Chinese Yuan" },

    { code: "CHF", symbol: "Fr", name: "Swiss Franc" },

    { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },

    { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },

];



function CurrencySelector({ value, onChange }: { value: string; onChange: (code: string) => void }) {

    const [open, setOpen] = useState(false);

    const [search, setSearch] = useState("");

    const [rect, setRect] = useState<DOMRect | null>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);



    const filtered = currencies.filter(c => 

        c.code.toLowerCase().includes(search.toLowerCase()) || 

        c.name.toLowerCase().includes(search.toLowerCase())

    );



    const handleOpen = () => {

        if (!open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());

        setOpen(!open);

        if (!open) setSearch("");

    };



    useEffect(() => {

        if (!open) return;

        const h = (e: MouseEvent) => {

            if (!triggerRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node)) setOpen(false);

        };

        document.addEventListener("mousedown", h);

        return () => document.removeEventListener("mousedown", h);

    }, [open]);



    const dropdown = open && rect ? (

        <div

            ref={dropdownRef}

            style={{
                position: "fixed",
                top: rect.top - 6,
                left: Math.min(rect.right - 220, window.innerWidth - 220 - 20),
                transform: "translateY(-100%)",
                width: 220,
                zIndex: 9999
            }}

            className="rounded-2xl border border-gray-100 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"

        >

            <div className="p-2 border-b border-gray-50">

                <div className="relative">

                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />

                    <input 

                        autoFocus

                        placeholder="Search..."

                        className="w-full h-9 pl-9 pr-4 text-xs font-bold bg-gray-50 border-none rounded-xl focus:ring-0 outline-none"

                        value={search}

                        onChange={(e) => setSearch(e.target.value)}

                    />

                </div>

            </div>

            <div className="max-h-60 overflow-y-auto p-1">

                {filtered.map(c => (

                    <button

                        key={c.code}

                        type="button"

                        onClick={() => { onChange(c.code); setOpen(false); }}

                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-orange-50 transition-colors text-left"

                    >

                        <div className="flex flex-col">

                            <span className="text-[11px] font-black text-gray-900">{c.code}</span>

                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{c.name}</span>

                        </div>

                        <span className="text-xs font-black text-[#F97316]">{c.symbol}</span>

                    </button>

                ))}

            </div>

        </div>

    ) : null;



    return (

        <div className="relative">

            <button

                ref={triggerRef}

                type="button"

                onClick={handleOpen}

                className="h-11 px-4 rounded-xl border border-gray-200 bg-gray-50/30 flex items-center gap-2 hover:bg-white hover:border-orange-200 transition-all"

            >

                <span className="text-[13px] font-bold text-gray-900">{value}</span>

                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />

            </button>

            {typeof window !== "undefined" && createPortal(dropdown, document.body)}

        </div>

    );

}



export function JobDescription({ 

    formData, 

    updateFormData,

    isAnalyzing,

    analysisError,

    startAnalysis,

    abortAnalysis,

    mode = 'form'

}: {

    formData: any;

    updateFormData: (data: any) => void;

    isAnalyzing: boolean;

    analysisError: string | null;

    startAnalysis: ({ file, url }: { file?: File, url?: string }) => void;

    abortAnalysis?: () => void;

    mode?: 'scan' | 'form';

}) {

    const [dragOver, setDragOver] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);



    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {

        const file = e.target.files?.[0];

        if (file) startAnalysis({ file });

    };





    const handleDrop = (e: React.DragEvent) => {

        e.preventDefault();

        setDragOver(false);

        const file = e.dataTransfer.files?.[0];

        if (file) startAnalysis({ file });

    };



    const clearFile = () => {

        abortAnalysis?.(); // STOP BACKGROUND IF RUNNING

        updateFormData((prev: any) => ({ 

            ...prev, 

            jdFileName: undefined, 

            description: "", 

            skills: "",

            responsibilities: "",

            requirements: "",

            experience: "",

            salary: ""

        }));

    };



    return (

        <div className="space-y-6">

            {analysisError && (

                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12px] font-medium flex items-center gap-2">

                    <X className="h-4 w-4" /> {analysisError}

                </div>

            )}

            {/*  TOP: Upload JD  */}

            <section>

                {mode === 'form' && (

                    <div className="flex items-center gap-3 mb-3 font-bold text-gray-900 uppercase tracking-widest text-[13px]">

                        <span className="h-5 w-1 rounded-full bg-[#F97316]" />

                        Upload JD

                    </div>

                )}



                {(!formData.jdFileName || isAnalyzing) ? (

                    <div

                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}

                        onDragLeave={() => setDragOver(false)}

                        onDrop={handleDrop}

                        onClick={() => !isAnalyzing && fileInputRef.current?.click()}

                        className={`flex items-center gap-4 rounded-xl border-2 border-dashed px-5 py-6 cursor-pointer transition-all duration-200 ${

                            dragOver ? "border-[#F97316] bg-orange-50" : "border-gray-200 bg-gray-50/70 hover:border-orange-300 hover:bg-orange-50/40"

                        }`}

                    >

                        {isAnalyzing ? (

                            <>

                                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin flex-shrink-0" />

                                <div className="flex-1">

                                    <p className="text-[13px] font-semibold text-gray-700 truncate max-w-[200px]">

                                        Analyzing {formData.jdFileName || "document"}...

                                    </p>

                                    <p className="text-[11px] text-gray-400">AI extraction in progress</p>

                                </div>

                                <div className="flex items-center gap-2">

                                    {formData.jdPreviewUrl && (

                                        <button

                                            type="button"

                                            onClick={(e) => { e.stopPropagation(); window.open(formData.jdPreviewUrl, '_blank'); }}

                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#F97316] hover:bg-orange-50 transition-all text-xs font-semibold"

                                        >

                                            <Eye className="h-3 w-3" />

                                            Preview

                                        </button>

                                    )}

                                    <button

                                        type="button"

                                        onClick={(e) => {

                                            e.stopPropagation();

                                            abortAnalysis?.(); // MUST STOP FIRST

                                            clearFile();

                                        }}

                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all text-xs font-semibold"

                                    >

                                        <X className="h-3 w-3" />

                                        Cancel

                                    </button>

                                </div>

                            </>

                        ) : (

                            <>

                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100">

                                    <Upload className="h-5 w-5 text-[#F97316]" />

                                </div>

                                <div className="flex-1 min-w-0">

                                    <p className="text-[13px] font-semibold text-gray-700">

                                        {dragOver ? "Drop to upload!" : "Drag & drop your JD here"}

                                    </p>

                                    <p className="text-[11px] text-gray-400">PDF, DOCX, or TXT Â· Max 10MB Â· Auto-extracts skills & responsibilities</p>

                                </div>

                                <span className="flex-shrink-0 rounded-lg border border-[#F97316] px-3 py-1.5 text-[12px] font-semibold text-[#F97316] hover:bg-orange-50 transition-colors">

                                    Browse

                                </span>

                            </>

                        )}

                        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFile} disabled={isAnalyzing} />

                    </div>

                ) : (

                    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">

                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-green-100">

                            {isAnalyzing ? <Loader2 className="h-4.5 w-4.5 text-green-600 animate-spin" /> : <FileText className="h-4.5 w-4.5 text-green-600" />}

                        </div>

                        <div className="flex-1 min-w-0">

                            <p className="text-[13px] font-semibold text-gray-800 truncate">{formData.jdFileName}</p>

                            <div className="flex items-center gap-1 mt-0.5">

                                {isAnalyzing ? (

                                    <div className="flex h-1 gap-0.5 mt-1.5">

                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0ms' }} />

                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '150ms' }} />

                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '300ms' }} />

                                    </div>

                                ) : (

                                    <>

                                        <CheckCircle2 className="h-3 w-3 text-green-500" />

                                        <p className="text-[11px] text-green-600 font-medium">Analyzed - fields auto-filled below</p>

                                    </>

                                )}

                            </div>

                        </div>

                        <div className="flex items-center gap-2">

                            {formData.jdPreviewUrl && (

                                <button

                                    type="button"

                                    onClick={() => window.open(formData.jdPreviewUrl, '_blank')}

                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 bg-white text-gray-500 hover:text-orange-600 hover:border-orange-200 transition-all text-[11px] font-bold uppercase tracking-wider"

                                >

                                    <Eye className="h-3.5 w-3.5" />

                                    Preview JD

                                </button>

                            )}

                            <button 

                                type="button" 

                                onClick={clearFile} 

                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 bg-white text-gray-400 hover:text-red-500 hover:border-red-200 transition-all text-[11px] font-bold uppercase tracking-wider"

                            >

                                <X className="h-3.5 w-3.5" />

                                Re-upload

                            </button>

                        </div>

                    </div>

                )}

            </section>



            {mode === 'form' && (

                <>

                    {/* Divider */}

                    <div className="flex items-center gap-3">

                        <div className="flex-1 h-px bg-gray-100" />

                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Write / Edit</span>

                        <div className="flex-1 h-px bg-gray-100" />

                    </div>



                    {/*  BOTTOM: Write & Edit JD  */}

                    <section className="space-y-4">

                        <div className="flex items-center gap-3 mb-4">

                            <span className="h-5 w-1 rounded-full bg-[#F97316]" />

                            <p className="text-[13px] font-bold text-gray-900 uppercase tracking-widest">Job Description Components</p>

                        </div>



                        {/* Top Row: Description & Responsibilities */}

                        <div className="grid md:grid-cols-2 gap-6 items-start">

                            <div>

                                <FieldLabel required>Job Description {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>

                                <div className="relative">

                                    <PenLine className="absolute left-3 top-3 h-3.5 w-3.5 text-gray-300 pointer-events-none" />

                                    <textarea

                                        rows={6}

                                        placeholder="Describe the role, expectations, and ideal candidate..."

                                        value={formData.description || ""}

                                        onChange={(e) => updateFormData((prev: any) => ({ ...prev, description: e.target.value }))}

                                        className={`${textareaClass} pl-9 ${isAnalyzing && !formData.description ? "bg-orange-50/20" : ""}`}

                                    />

                                    {/* Word Counter */}

                                    <div className="absolute right-3 bottom-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-50/80 backdrop-blur-sm border border-gray-100">

                                        <p className={`text-[10px] font-black uppercase tracking-widest ${

                                            (formData.description?.trim().split(/\s+/).filter(Boolean).length || 0) >= 30 

                                                ? "text-green-500" 

                                                : "text-gray-400"

                                        }`}>

                                            {formData.description?.trim().split(/\s+/).filter(Boolean).length || 0} / 30 Words

                                        </p>

                                    </div>

                                </div>

                            </div>

                            <div>

                                <FieldLabel required>Key Responsibilities {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>

                                <textarea

                                    rows={6}

                                    placeholder="â€¢ Define clear objectives&#10;â€¢ Collaborate with cross-functional teams&#10;â€¢ ..."

                                    value={formData.responsibilities || ""}

                                    onChange={(e) => {

                                        const formatBullets = (val: string) => val.split('\n').map(line => {

                                            if (line.trim() === "") return line;

                                            if (line.trim().startsWith("â€¢")) return line;

                                            return `â€¢ ${line.trimStart()}`;

                                        }).join('\n');

                                        updateFormData((prev: any) => ({ ...prev, responsibilities: formatBullets(e.target.value) }));

                                    }}

                                    className={`${textareaClass} ${isAnalyzing && !formData.responsibilities ? "bg-orange-50/20" : ""}`}

                                />

                            </div>

                        </div>



                        {/* Middle Row: Skills & Requirements */}

                        <div className="grid md:grid-cols-2 gap-6 items-start">

                            <div>

                                <FieldLabel required>Required Skills {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>

                                <textarea

                                    rows={4}

                                    placeholder="â€¢ React.js & Next.js&#10;â€¢ TypeScript & Node.js&#10;â€¢ AWS / Cloud Infrastructure"

                                    value={formData.skills || ""}

                                    onChange={(e) => {

                                        const formatBullets = (val: string) => val.split('\n').map(line => {

                                            if (line.trim() === "") return line;

                                            if (line.trim().startsWith("â€¢")) return line;

                                            return `â€¢ ${line.trimStart()}`;

                                        }).join('\n');

                                        updateFormData((prev: any) => ({ ...prev, skills: formatBullets(e.target.value) }));

                                    }}

                                    className={`${textareaClass} ${isAnalyzing && !formData.skills ? "bg-orange-50/20" : ""}`}

                                />

                                <p className="text-[10px] text-gray-400 font-medium mt-1.5 ml-1">Write skills as bullet points for better AI matching</p>

                            </div>

                            <div>

                                <FieldLabel required>Requirements {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>

                                <textarea

                                    rows={4}

                                    placeholder="â€¢ Bachelor's degree in CS or related field&#10;â€¢ 3+ years of experience in...&#10;â€¢ ..."

                                    value={formData.requirements || ""}

                                    onChange={(e) => {

                                        const formatBullets = (val: string) => val.split('\n').map(line => {

                                            if (line.trim() === "") return line;

                                            if (line.trim().startsWith("â€¢")) return line;

                                            return `â€¢ ${line.trimStart()}`;

                                        }).join('\n');

                                        updateFormData((prev: any) => ({ ...prev, requirements: formatBullets(e.target.value) }));

                                    }}

                                    className={`${textareaClass} ${isAnalyzing && !formData.requirements ? "bg-orange-50/20" : ""}`}

                                />

                            </div>

                        </div>

                        {/* Bottom Row: Experience & Salary */}
                        <div className="grid md:grid-cols-2 gap-6 items-end">
                            <div>
                                <FieldLabel required>Experience (Yrs)</FieldLabel>
                                <input
                                    type="text"
                                    placeholder="e.g. 2-5 years"
                                    value={formData.experience || ""}
                                    onChange={(e) => updateFormData((prev: any) => ({ ...prev, experience: e.target.value }))}
                                    className={`${inputClass} ${isAnalyzing && !formData.experience ? "bg-orange-50/20" : ""}`}
                                />
                            </div>

                            <div>
                                {(() => {
                                    const { currency: curr } = splitSalaryValue(formData.salary, "INR");
                                    const label = curr === "INR" ? "Salary Range (LPA · INR)" : `Salary Range (${curr})`;
                                    return <FieldLabel required>{label}</FieldLabel>;
                                })()}

                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            placeholder="e.g. 12-18"
                                            value={splitSalaryValue(formData.salary, "INR").amount}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const { currency } = splitSalaryValue(formData.salary, "INR");
                                                updateFormData((prev: any) => ({ ...prev, salary: formatSalaryValue(val, currency) }));
                                            }}
                                            className={inputClass}
                                        />

                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 uppercase tracking-widest pointer-events-none">
                                            {splitSalaryValue(formData.salary, "INR").amount ? "LPA" : ""}
                                        </div>
                                    </div>

                                    <CurrencySelector
                                        value={splitSalaryValue(formData.salary, "INR").currency}
                                        onChange={(code) => {
                                            const { amount } = splitSalaryValue(formData.salary, "INR");
                                            updateFormData((prev: any) => ({ ...prev, salary: formatSalaryValue(amount, code) }));
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                    </section>

                    {isAnalyzing && (

                        <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-between mb-6 animate-in-fade">

                            <div className="flex items-center gap-3">

                                <div className="h-9 w-9 rounded-xl bg-orange-100 flex items-center justify-center">

                                    <PenLine className="h-5 w-5 text-[#F97316] animate-pulse" />

                                </div>

                                <div>

                                    <p className="text-[13px] font-bold text-gray-900">Background Extraction Active...</p>

                                    <p className="text-[11px] text-orange-600 font-medium">JD info and skills are being filled end-to-end</p>

                                </div>

                            </div>

                        </div>

                    )}

                </>

            )}

        </div>

    );

}




