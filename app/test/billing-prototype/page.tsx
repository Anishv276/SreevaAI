"use client";

import React, { useState, useMemo } from "react";
import { 
  Building2, 
  Search, 
  ChevronRight,
  Download, 
  FileText, 
  FileSearch, 
  Video, 
  ClipboardCheck,
  CreditCard,
  Calendar,
  Mic,
  Volume2,
  BrainCircuit,
  FileCheck2,
  MessageSquare,
  ArrowLeft,
  PieChart,
  BarChart3,
  Activity,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data matching the real Super Admin Org Summary structure
type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  totalInterviewsAllowed: number;
  totalInterviewsUsed: number;
};

const MOCK_ORGS: OrgSummary[] = [
  { id: "1", name: "Acme Corp", slug: "acme", plan: "Enterprise", status: "ACTIVE", totalInterviewsAllowed: 1000, totalInterviewsUsed: 450 },
  { id: "2", name: "Globex Inc", slug: "globex", plan: "Starter", status: "ACTIVE", totalInterviewsAllowed: 50, totalInterviewsUsed: 48 },
  { id: "3", name: "Initech", slug: "initech", plan: "Pro", status: "INACTIVE", totalInterviewsAllowed: 300, totalInterviewsUsed: 300 },
];

const MOCK_INTERVIEW_SUB_COSTS = {
  tts: { total: 45.00, model: "OpenAI TTS-1", requests: 1250 },
  stt: { total: 35.00, model: "Whisper large-v3", requests: 1100 },
  llm: { total: 180.00, model: "Claude 3.5 Sonnet", requests: 3400 },
  eval: { total: 40.00, model: "GPT-4o mini", requests: 90 },
  brief: { total: 20.00, model: "GPT-4o", requests: 45 }
};

const MOCK_COSTS = {
  resume: { 
    total: 45.50, count: 182, 
    breakdown: { parsing: 15.50, llm: 30.00 },
    model: "Claude 3.5 Sonnet",
    requests: 364
  },
  jd: { 
    total: 12.00, count: 8,
    breakdown: { processing: 2.00, llm: 10.00 },
    model: "GPT-4o",
    requests: 16
  },
  interview: { 
    total: 320.00, count: 45,
    model: "Claude 3.5 Sonnet" 
  },
  report: { 
    total: 65.00, count: 13,
    breakdown: { formatting: 15.00, llm: 50.00 },
    model: "GPT-4o",
    requests: 26
  },
};

const GRAND_TOTAL = MOCK_COSTS.resume.total + MOCK_COSTS.jd.total + MOCK_COSTS.interview.total + MOCK_COSTS.report.total;

const MOCK_PEOPLE_RESUME = [
  { id: "r1", date: "2026-07-10", candidate: "Alice Smith", role: "Frontend Dev", file: "alice_resume_v2.pdf", cost: 0.25 },
  { id: "r2", date: "2026-07-12", candidate: "Bob Jones", role: "Backend Eng", file: "bob_jones_cv.pdf", cost: 0.25 },
  { id: "r3", date: "2026-07-13", candidate: "Diana Prince", role: "Data Scientist", file: "diana_ds_2026.docx", cost: 0.25 },
];

const MOCK_PEOPLE_JD = [
  { id: "j1", date: "2026-07-01", jdName: "Senior React Developer", creator: "Sarah HR", cost: 1.50 },
  { id: "j2", date: "2026-07-05", jdName: "Lead Backend Engineer (Go)", creator: "Mike Manager", cost: 1.50 },
];

const MOCK_PEOPLE_REPORT = [
  { id: "rep1", date: "2026-07-11", candidate: "Alice Smith", role: "Frontend Dev", manager: "Sarah HR", cost: 5.00, interviewsCount: 2 },
  { id: "rep2", date: "2026-07-15", candidate: "Charlie Brown", role: "Product Manager", manager: "Mike Manager", cost: 5.00, interviewsCount: 3 },
];

const MOCK_INTERVIEWS = [
  { id: "int_1", date: "2026-07-10T09:15:00", candidate: "Alice Smith", role: "Frontend Dev", totalCost: 14.50 },
  { id: "int_2", date: "2026-07-11T14:30:00", candidate: "Bob Jones", role: "Backend Eng", totalCost: 18.25 },
];

type Category = "resume" | "jd" | "interview" | "report" | null;
type InterviewSub = "tts" | "stt" | "llm" | "eval" | "brief" | null;

const DonutChart = ({ data, total, size = "md" }: { data: { value: number, color: string, label: string }[], total: number, size?: "md" | "lg" }) => {
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };
  const dim = size === "lg" ? "w-64 h-64" : "w-48 h-48";
  return (
    <div className={`relative ${dim} mx-auto flex items-center justify-center`}>
      <svg viewBox="-1.2 -1.2 2.4 2.4" className="transform -rotate-90 w-full h-full">
        {data.map((slice, i) => {
          if(slice.value === 0) return null;
          const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
          cumulativePercent += slice.value / total;
          const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
          const largeArcFlag = slice.value / total > 0.5 ? 1 : 0;
          return (
            <path key={i} d={`M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`} fill="none" stroke={slice.color} strokeWidth="0.3" className="hover:stroke-[0.35] transition-all cursor-pointer">
              <title>{slice.label}: ${slice.value.toFixed(2)}</title>
            </path>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Total</span>
        <span className="text-2xl font-black text-gray-900">${total.toFixed(2)}</span>
      </div>
    </div>
  );
};


export default function StandaloneBillingPrototype() {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(MOCK_ORGS[0].id);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>(null);
  const [activeInterviewSub, setActiveInterviewSub] = useState<InterviewSub>(null);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MOCK_ORGS;
    return MOCK_ORGS.filter((org) =>
      [org.name, org.slug, org.plan, org.status].join(" ").toLowerCase().includes(q)
    );
  }, [search]);

  const selectedOrg = MOCK_ORGS.find((o) => o.id === selectedOrgId) || null;
  const interviewRemaining = selectedOrg ? Math.max(0, selectedOrg.totalInterviewsAllowed - selectedOrg.totalInterviewsUsed) : 0;

  const handleOrgChange = (id: string) => {
    setSelectedOrgId(id);
    setActiveCategory(null);
    setActiveInterviewSub(null);
  };

  const renderOverview = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Grand Total Header */}
      <div className="bg-gradient-to-br from-violet-900 to-violet-700 rounded-3xl p-8 mb-8 text-white shadow-xl flex items-center justify-between">
        <div>
          <p className="text-violet-200 font-bold uppercase tracking-widest text-xs mb-2">Grand Total Cost This Cycle</p>
          <h2 className="text-6xl font-black tracking-tighter">${GRAND_TOTAL.toFixed(2)}</h2>
          <p className="text-violet-300 text-sm mt-2">Cumulative cost across all extractions, LLM models, and interviews.</p>
        </div>
        <div className="hidden md:block">
          <DonutChart 
            total={GRAND_TOTAL}
            size="md"
            data={[
              { value: MOCK_COSTS.resume.total, color: '#60a5fa', label: 'Resume' },
              { value: MOCK_COSTS.jd.total, color: '#34d399', label: 'JD' },
              { value: MOCK_COSTS.interview.total, color: '#c4b5fd', label: 'Interview' },
              { value: MOCK_COSTS.report.total, color: '#fb923c', label: 'Report' }
            ]} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* JD Card */}
        <button onClick={() => setActiveCategory("jd")} className="text-left bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-emerald-200 transition-all group flex flex-col h-full">
          <div className="flex items-center justify-between mb-6 w-full">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileSearch className="w-7 h-7" />
            </div>
            <div className="bg-gray-50 p-2 rounded-full group-hover:bg-emerald-50 transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-600" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-gray-500 mb-1 uppercase tracking-wider">JD Extraction</h3>
          <p className="text-4xl font-black text-gray-900 mb-2">${MOCK_COSTS.jd.total.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mb-6">Extracting requirements using {MOCK_COSTS.jd.model} from {MOCK_COSTS.jd.count} JDs.</p>
          <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center w-full">
            <span className="text-emerald-600 font-bold text-sm group-hover:underline">Open fully to see API Requests & Analysis</span>
          </div>
        </button>

        {/* Resume Card */}
        <button onClick={() => setActiveCategory("resume")} className="text-left bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-blue-200 transition-all group flex flex-col h-full">
          <div className="flex items-center justify-between mb-6 w-full">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText className="w-7 h-7" />
            </div>
            <div className="bg-gray-50 p-2 rounded-full group-hover:bg-blue-50 transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-gray-500 mb-1 uppercase tracking-wider">Resume Extraction</h3>
          <p className="text-4xl font-black text-gray-900 mb-2">${MOCK_COSTS.resume.total.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mb-6">Parsing and scoring via {MOCK_COSTS.resume.model} for {MOCK_COSTS.resume.count} Resumes.</p>
          <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center w-full">
            <span className="text-blue-600 font-bold text-sm group-hover:underline">Open fully to see API Requests & Analysis</span>
          </div>
        </button>

        {/* Interview Card */}
        <button onClick={() => { setActiveCategory("interview"); setActiveInterviewSub(null); }} className="text-left bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-violet-200 transition-all group flex flex-col h-full relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-bl-xl shadow-md">Highest Cost</div>
          <div className="flex items-center justify-between mb-6 w-full">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Video className="w-7 h-7" />
            </div>
            <div className="bg-gray-50 p-2 rounded-full group-hover:bg-violet-50 transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-violet-600" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-gray-500 mb-1 uppercase tracking-wider">Interview Sessions</h3>
          <p className="text-4xl font-black text-gray-900 mb-2">${MOCK_COSTS.interview.total.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mb-6">Includes STT, TTS, {MOCK_COSTS.interview.model}, Eval, and Brief components across {MOCK_COSTS.interview.count} sessions.</p>
          <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center w-full">
            <span className="text-violet-600 font-bold text-sm group-hover:underline">Open fully to see Requests, Models & Pie Chart</span>
          </div>
        </button>

        {/* Report Card */}
        <button onClick={() => setActiveCategory("report")} className="text-left bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-orange-200 transition-all group flex flex-col h-full">
          <div className="flex items-center justify-between mb-6 w-full">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ClipboardCheck className="w-7 h-7" />
            </div>
            <div className="bg-gray-50 p-2 rounded-full group-hover:bg-orange-50 transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-600" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-gray-500 mb-1 uppercase tracking-wider">Final Report</h3>
          <p className="text-4xl font-black text-gray-900 mb-2">${MOCK_COSTS.report.total.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mb-6">Aggregated post-interview reports using {MOCK_COSTS.report.model} generated {MOCK_COSTS.report.count} times.</p>
          <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center w-full">
            <span className="text-orange-600 font-bold text-sm group-hover:underline">Open fully to see API Requests & Analysis</span>
          </div>
        </button>
      </div>
    </div>
  );

  const renderInterviewAnalysis = () => (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <button onClick={() => setActiveCategory(null)} className="flex items-center gap-2 text-sm font-bold text-violet-600 hover:text-violet-700 transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Overview
      </button>

      <div className="bg-white rounded-3xl border border-violet-100 shadow-md p-8 mb-8">
        <h2 className="text-3xl font-black text-gray-900 mb-2">Interview Sessions Complete Analysis</h2>
        <p className="text-gray-500 mb-8">Deep dive into inner elements: TTS, STT, LLM Models, Eval, and Brief costs.</p>

        {/* Top Analysis: Total + Sub Elements */}
        <div className="bg-violet-50 rounded-2xl p-8 border border-violet-100 mb-12 relative">
          <p className="text-sm font-bold uppercase tracking-widest text-violet-600 mb-2">Total Interview Cost</p>
          <p className="text-6xl font-black text-violet-900 mb-8">${MOCK_COSTS.interview.total.toFixed(2)}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <button onClick={() => setActiveInterviewSub(activeInterviewSub === 'tts' ? null : 'tts')} className={cn("rounded-xl p-4 shadow-sm border text-center transition-all focus:outline-none", activeInterviewSub === 'tts' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500' : 'bg-white border-violet-50 hover:border-indigo-300')}>
              <Volume2 className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase text-gray-500">TTS</p>
              <p className="text-2xl font-black text-gray-900">${MOCK_INTERVIEW_SUB_COSTS.tts.total.toFixed(2)}</p>
            </button>
            <button onClick={() => setActiveInterviewSub(activeInterviewSub === 'stt' ? null : 'stt')} className={cn("rounded-xl p-4 shadow-sm border text-center transition-all focus:outline-none", activeInterviewSub === 'stt' ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500' : 'bg-white border-violet-50 hover:border-rose-300')}>
              <Mic className="w-6 h-6 text-rose-500 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase text-gray-500">STT</p>
              <p className="text-2xl font-black text-gray-900">${MOCK_INTERVIEW_SUB_COSTS.stt.total.toFixed(2)}</p>
            </button>
            <button onClick={() => setActiveInterviewSub(activeInterviewSub === 'llm' ? null : 'llm')} className={cn("rounded-xl p-4 shadow-sm text-center transition-all focus:outline-none relative", activeInterviewSub === 'llm' ? 'bg-violet-100 ring-4 ring-violet-500 border-violet-300' : 'bg-white ring-2 ring-violet-500')}>
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">{MOCK_COSTS.interview.model}</span>
              <BrainCircuit className="w-6 h-6 text-violet-600 mx-auto mb-2 mt-2" />
              <p className="text-xs font-bold uppercase text-violet-600">LLM</p>
              <p className="text-2xl font-black text-violet-900">${MOCK_INTERVIEW_SUB_COSTS.llm.total.toFixed(2)}</p>
            </button>
            <button onClick={() => setActiveInterviewSub(activeInterviewSub === 'eval' ? null : 'eval')} className={cn("rounded-xl p-4 shadow-sm border text-center transition-all focus:outline-none", activeInterviewSub === 'eval' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500' : 'bg-white border-violet-50 hover:border-emerald-300')}>
              <FileCheck2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase text-gray-500">Eval</p>
              <p className="text-2xl font-black text-gray-900">${MOCK_INTERVIEW_SUB_COSTS.eval.total.toFixed(2)}</p>
            </button>
            <button onClick={() => setActiveInterviewSub(activeInterviewSub === 'brief' ? null : 'brief')} className={cn("rounded-xl p-4 shadow-sm border text-center transition-all focus:outline-none", activeInterviewSub === 'brief' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500' : 'bg-white border-violet-50 hover:border-blue-300')}>
              <MessageSquare className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase text-gray-500">Brief</p>
              <p className="text-2xl font-black text-gray-900">${MOCK_INTERVIEW_SUB_COSTS.brief.total.toFixed(2)}</p>
            </button>
          </div>

          {activeInterviewSub && (
            <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6 shadow-inner flex items-center justify-between animate-in fade-in slide-in-from-top-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Specific Model Used</p>
                <p className="text-xl font-black text-gray-900">{MOCK_INTERVIEW_SUB_COSTS[activeInterviewSub].model}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Total API Requests</p>
                <div className="flex items-center justify-end gap-2 text-xl font-black text-gray-900">
                  <Activity className="w-5 h-5 text-violet-500" />
                  {MOCK_INTERVIEW_SUB_COSTS[activeInterviewSub].requests.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-12 items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-2">How much each occupied</h3>
            <div className="bg-gray-50 p-8 rounded-3xl border border-gray-200">
              <DonutChart 
                total={MOCK_COSTS.interview.total}
                size="lg"
                data={[
                  { value: MOCK_INTERVIEW_SUB_COSTS.tts.total, color: '#6366f1', label: 'TTS' },
                  { value: MOCK_INTERVIEW_SUB_COSTS.stt.total, color: '#f43f5e', label: 'STT' },
                  { value: MOCK_INTERVIEW_SUB_COSTS.llm.total, color: '#7c3aed', label: `LLM (${MOCK_COSTS.interview.model})` },
                  { value: MOCK_INTERVIEW_SUB_COSTS.eval.total, color: '#10b981', label: 'Eval' },
                  { value: MOCK_INTERVIEW_SUB_COSTS.brief.total, color: '#3b82f6', label: 'Brief' },
                ]}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-2">Candidates and Interview Costs</h3>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-left bg-white">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Date</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Candidate / Role</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-900 text-right">Interview Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MOCK_INTERVIEWS.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap"><p className="text-sm text-gray-600">{new Date(session.date).toLocaleDateString()}</p></td>
                      <td className="px-4 py-4 whitespace-nowrap"><p className="text-sm font-bold text-gray-900">{session.candidate}</p><p className="text-xs text-gray-500">{session.role}</p></td>
                      <td className="px-4 py-4 text-sm font-black text-violet-600 text-right">${session.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans p-6 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Real Super Admin Header Structure */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in duration-500">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Billing (Prototype)</h1>
            <p className="text-sm text-gray-400 mt-0.5">Select an organization and view its granular analytics</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-xl bg-white px-4 py-2.5 shadow-sm border border-[#E9E7FF]">
              <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Selected org</div>
              <div className="text-sm font-semibold text-gray-900">{selectedOrg?.name || "None selected"}</div>
            </div>
            <div className="rounded-xl bg-white px-4 py-2.5 shadow-sm border border-[#E9E7FF]">
              <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Remaining interviews</div>
              <div className="text-sm font-semibold text-gray-900">{interviewRemaining}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)] items-start">
          
          {/* Real Super Admin Sidebar Structure */}
          <aside className="sticky top-5 overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(124,58,237,0.04)] border border-[#E9E7FF] animate-in slide-in-from-left-4 duration-500">
            <div className="p-4 border-b border-[#F0EEF8] bg-gray-50/50">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm border border-gray-100 text-gray-500">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">Organizations</p>
                  <p className="text-[11px] font-medium text-gray-700">{MOCK_ORGS.length} total</p>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search orgs"
                  className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100 transition-all"
                />
              </div>
            </div>
            <div className="max-h-[calc(100vh-240px)] overflow-y-auto p-2 custom-scrollbar">
              {filteredOrgs.length === 0 ? (
                <div className="p-5 text-center text-[12px] text-gray-500">No organizations match your search.</div>
              ) : (
                <div className="space-y-1.5">
                  {filteredOrgs.map((org) => {
                    const isActive = org.id === selectedOrgId;
                    const rem = Math.max(0, org.totalInterviewsAllowed - org.totalInterviewsUsed);
                    return (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleOrgChange(org.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 group",
                          isActive
                            ? "border-[#7C3AED] bg-violet-50"
                            : "border-transparent bg-white hover:border-violet-100 hover:bg-violet-50/30"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm transition-colors", isActive ? "bg-[#7C3AED]" : "bg-gray-800")}>
                            {org.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="truncate text-[13px] font-bold text-gray-900 group-hover:text-[#7C3AED]">{org.name}</h3>
                              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-gray-300", isActive && "translate-x-0.5 text-[#7C3AED]")} />
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-gray-400">{org.slug}</span>
                              <span className="h-1 w-1 rounded-full bg-gray-200" />
                              <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-gray-400">{org.plan}</span>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.14em]">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-md border",
                                org.status === "ACTIVE"
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                  : "bg-gray-100 text-gray-400 border-gray-200"
                              )}>
                                {org.status}
                              </span>
                              <span className="text-gray-500">
                                {rem} left
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* Detailed Content View */}
          <section className="min-w-0">
            {selectedOrg ? (
              activeCategory === null ? renderOverview() :
              activeCategory === "interview" ? renderInterviewAnalysis() :
              <div className="animate-in fade-in duration-500 p-8 text-center text-gray-500">
                <button onClick={() => setActiveCategory(null)} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 mx-auto mb-4">
                  <ArrowLeft className="w-4 h-4" /> Back to Overview
                </button>
                <p>(Other analysis views omitted for brevity, logic remains the same)</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
                Select an organization to view billing.
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
