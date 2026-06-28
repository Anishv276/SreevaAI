"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Bot, Mic, AudioLines, Users, ChevronRight, Check, Loader2, Brain, Search, ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { LLM_MODELS, TTS_MODELS, ALL_VOICES, getVoicesForProvider, getTtsModelsForProvider, type TtsProvider } from "@/lib/ai-models-config";

const STT_OPTIONS = [
  { id: "flux-general-en",    label: "Flux English",        description: "Best for English-only interviews" },
  { id: "flux-general-multi", label: "Flux Multilingual",   description: "Hindi + English (code-switching)" },
];

const LLM_PIPELINE_FIELDS = [
  { key: "llmResumeExtraction",  label: "Resume Extraction",    hint: "Parses uploaded resume PDFs" },
  { key: "llmJdExtraction",      label: "JD Extraction",        hint: "Parses job description files/URLs" },
  { key: "llmResumeReport",      label: "Resume Report",        hint: "Generates initial screening scorecard" },
  { key: "llmInterviewLive",     label: "Interview Live Agent", hint: "Brain of the live AI interviewer" },
  { key: "llmInterviewEval",     label: "Interview Evaluator",  hint: "Scores answers in real-time" },
  { key: "llmInterviewBrief",    label: "Interview Brief",      hint: "Pre-computes interview strategy" },
  { key: "llmInterviewReport",   label: "Interview Report",     hint: "Generates final scorecard after interview" },
] as const;

type OrgSummary = {
  id: string; name: string; slug: string;
  sttModel: string; ttsProvider: string; ttsModel: string; voiceId: string;
  allowedVoices: string[];
  llmResumeExtraction: string; llmJdExtraction: string; llmResumeReport: string;
  llmInterviewLive: string; llmInterviewEval: string; llmInterviewBrief: string; llmInterviewReport: string;
};
type OrgConfig = OrgSummary;

function LlmDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = LLM_MODELS.find(m => m.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-xl border text-sm font-medium transition-all w-[220px] justify-between"
        style={{ background: "#F9FAFB", borderColor: open ? "#8B5CF6" : "#E5E7EB", color: "#374151" }}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-[260px] bg-white rounded-xl shadow-lg overflow-hidden"
          style={{ border: "1px solid #E9E7FF", boxShadow: "0 8px 24px rgba(124,58,237,0.12)" }}
        >
          {LLM_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-violet-50 transition-colors text-left"
            >
              <div>
                <p className={`text-sm font-semibold ${m.id === value ? "text-violet-700" : "text-gray-800"}`}>{m.label}</p>
                <p className="text-[11px] text-gray-400">{m.description}</p>
              </div>
              {m.id === value && <Check className="h-3.5 w-3.5 text-violet-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModelsPage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [config, setConfig] = useState<OrgConfig | null>(null);
  const [dirty, setDirty] = useState<Partial<OrgConfig & { allowedVoices: string[] }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/super-admin/models")
      .then(r => r.json())
      .then(d => { setOrgs(d.orgs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const selectOrg = useCallback(async (orgId: string) => {
    setSelectedOrgId(orgId);
    setDirty({});
    const r = await fetch(`/api/super-admin/models?orgId=${orgId}`);
    const d = await r.json();
    setConfig(d.org ?? null);
  }, []);

  const patch = (key: keyof OrgConfig, value: string | string[]) => {
    setDirty(prev => ({ ...prev, [key]: value }));
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
    if (key === "ttsProvider") {
      const provider = value as TtsProvider;
      const firstModel = getTtsModelsForProvider(provider)[0]?.id;
      if (firstModel) {
        setDirty(prev => ({ ...prev, ttsModel: firstModel, allowedVoices: [] }));
        setConfig(prev => prev ? { ...prev, ttsModel: firstModel, allowedVoices: [] } : prev);
      }
    }
  };

  const toggleVoice = (voiceId: string) => {
    const current: string[] = config?.allowedVoices ?? [];
    const next = current.includes(voiceId) ? current.filter(id => id !== voiceId) : [...current, voiceId];
    patch("allowedVoices", next);
  };

  const save = async () => {
    if (!selectedOrgId || !Object.keys(dirty).length) return;
    setSaving(true);
    try {
      const r = await fetch("/api/super-admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: selectedOrgId, ...dirty }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      const updated = await r.json();
      setConfig(updated.org);
      setDirty({});
      setOrgs(prev => prev.map(o => o.id === selectedOrgId ? { ...o, ...updated.org } : o));
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const filteredOrgs = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.slug.toLowerCase().includes(search.toLowerCase())
  );

  const hasDirty = Object.keys(dirty).length > 0;
  const currentTtsProvider = (config?.ttsProvider ?? "ELEVENLABS") as TtsProvider;
  const ttsModelsForProvider = getTtsModelsForProvider(currentTtsProvider);
  const voicesForProvider = getVoicesForProvider(currentTtsProvider);
  const selectedVoiceIds: string[] = config?.allowedVoices ?? [];

  return (
    // Fixed height layout: left panel fixed, right panel scrolls
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      {/* Header — fixed */}
      <div className="flex-shrink-0 pb-5">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Model Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">Configure LLM, STT, TTS, and voices per organization.</p>
      </div>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* LEFT: Org List — fixed, no scroll on outer, list scrolls inside */}
        <div
          className="w-[260px] flex-shrink-0 bg-white rounded-2xl flex flex-col"
          style={{ border: "1px solid #E9E7FF", boxShadow: "0 2px 8px rgba(124,58,237,0.06)" }}
        >
          {/* Search — sticky inside left panel */}
          <div className="flex-shrink-0 px-4 py-3" style={{ borderBottom: "1px solid #F0EEF8" }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search orgs…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200 transition"
              />
            </div>
          </div>
          {/* Org list scrolls independently */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
              </div>
            ) : filteredOrgs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No organizations</p>
            ) : (
              filteredOrgs.map(org => {
                const isActive = org.id === selectedOrgId;
                return (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 transition-all group"
                    style={isActive ? {
                      background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.04))",
                      borderRight: "3px solid #8B5CF6",
                    } : { borderBottom: "1px solid #F9F9FF" }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                    >
                      {org.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isActive ? "text-violet-700" : "text-gray-800"}`}>{org.name}</p>
                      <p className="text-xs text-gray-400 truncate">{org.slug}</p>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-violet-500" : "text-gray-300 group-hover:text-gray-500"}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Config — scrollable */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!config ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ border: "1px solid #E9E7FF" }}>
              <Bot className="h-10 w-10 text-violet-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Select an organization to configure its AI models</p>
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {/* Save bar */}
              {hasDirty && (
                <div
                  className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 rounded-xl"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.04))", border: "1px solid rgba(139,92,246,0.2)" }}
                >
                  <p className="text-sm text-violet-700 font-medium">Unsaved changes</p>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="h-8 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save Changes
                  </button>
                </div>
              )}

              {/* LLM Pipelines — dropdowns */}
              <Section icon={Brain} title="LLM Pipelines" subtitle="Model used for each AI pipeline step">
                <div className="space-y-3">
                  {LLM_PIPELINE_FIELDS.map(({ key, label, hint }) => (
                    <div key={key} className="flex items-center gap-4">
                      <div className="w-[190px] flex-shrink-0">
                        <p className="text-sm font-medium text-gray-800">{label}</p>
                        <p className="text-xs text-gray-400">{hint}</p>
                      </div>
                      <LlmDropdown
                        value={(config as any)[key] ?? ""}
                        onChange={v => patch(key as keyof OrgConfig, v)}
                      />
                    </div>
                  ))}
                </div>
              </Section>

              {/* STT — only flux-en / flux-multi */}
              <Section icon={Mic} title="Speech-to-Text (Deepgram)" subtitle="Which Deepgram Flux model listens to the candidate">
                <div className="flex gap-3">
                  {STT_OPTIONS.map(m => {
                    const isSelected = config.sttModel === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => patch("sttModel", m.id)}
                        className="flex flex-col items-start px-4 py-3 rounded-xl border transition-all text-left"
                        style={isSelected ? {
                          background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))",
                          borderColor: "#8B5CF6",
                        } : { background: "#F9FAFB", borderColor: "#E5E7EB" }}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="h-3.5 w-3.5 text-violet-600" />}
                          <span className={`text-sm font-semibold ${isSelected ? "text-violet-700" : "text-gray-700"}`}>{m.label}</span>
                        </div>
                        <span className="text-xs text-gray-400 mt-0.5">{m.description}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* TTS */}
              <Section icon={AudioLines} title="Text-to-Speech" subtitle="Voice engine and model for the AI interviewer">
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Provider</p>
                  <div className="flex gap-3">
                    {(["ELEVENLABS", "CARTESIA", "SARVAM"] as TtsProvider[]).map(provider => {
                      const isSelected = currentTtsProvider === provider;
                      const label = provider === "ELEVENLABS" ? "ElevenLabs" : provider === "CARTESIA" ? "Cartesia" : "Sarvam";
                      return (
                        <button
                          key={provider}
                          onClick={() => patch("ttsProvider", provider)}
                          className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                          style={isSelected ? {
                            background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))",
                            borderColor: "#8B5CF6", color: "#6D28D9",
                          } : { background: "#F9FAFB", borderColor: "#E5E7EB", color: "#6B7280" }}
                        >
                          {isSelected && <Check className="inline h-3 w-3 mr-1" />}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Model</p>
                  <div className="flex flex-wrap gap-3">
                    {ttsModelsForProvider.map(m => {
                      const isSelected = config.ttsModel === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => patch("ttsModel", m.id)}
                          className="flex flex-col items-start px-4 py-3 rounded-xl border transition-all text-left"
                          style={isSelected ? {
                            background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))",
                            borderColor: "#8B5CF6",
                          } : { background: "#F9FAFB", borderColor: "#E5E7EB" }}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected && <Check className="h-3.5 w-3.5 text-violet-600" />}
                            <span className={`text-sm font-semibold ${isSelected ? "text-violet-700" : "text-gray-700"}`}>{m.label}</span>
                          </div>
                          <span className="text-xs text-gray-400 mt-0.5">{m.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Section>

              {/* Voices — multi-select, stored as allowedVoices JSON, shown in drive picker */}
              <Section icon={Users} title="Allowed Voices" subtitle={`Multi-select voices available for this org's drives. Selected: ${selectedVoiceIds.length}`}>
                <p className="text-xs text-gray-400 mb-3">
                  Admins pick from these voices when creating a drive. The drive's selected voice is used during the interview.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {voicesForProvider.map(v => {
                    const isSelected = selectedVoiceIds.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggleVoice(v.id)}
                        className="flex flex-col items-start p-3 rounded-xl border transition-all text-left"
                        style={isSelected ? {
                          background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))",
                          borderColor: "#8B5CF6",
                        } : { background: "#F9FAFB", borderColor: "#E5E7EB" }}
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                            style={{ background: isSelected ? "linear-gradient(135deg, #8B5CF6, #3B82F6)" : "#D1D5DB" }}
                          >
                            {v.name[0]}
                          </div>
                          <span className={`text-sm font-semibold truncate ${isSelected ? "text-violet-700" : "text-gray-800"}`}>{v.name}</span>
                          {isSelected && <Check className="h-3 w-3 text-violet-600 ml-auto flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 leading-tight">{v.description}</p>
                        {(v.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(v.tags ?? []).slice(0, 2).map(tag => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">{tag}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E9E7FF", boxShadow: "0 2px 8px rgba(124,58,237,0.04)" }}>
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid #F0EEF8" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))" }}>
          <Icon className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{title}</p>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
