"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Loader2, Plus, Search, Trash2, X, Zap, AudioWaveform, Mic2, Play, Pause } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { cn } from "@/lib/utils";
type BuiltInVoice = {
  id: string;
  name: string;
  provider: "SARVAM" | "ELEVENLABS";
  model: string;
  description: string;
  gender: "male" | "female";
  tags?: string[];
  isSelectable: boolean;
};
type VoiceRegistry = {
  selectableVoices: BuiltInVoice[];
  customVoices: Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    description: string | null;
    gender: string | null;
    tags: string[];
    isBuiltIn: boolean;
    isActive: boolean;
    isSelectable: boolean;
  }>;
  builtInVoices: BuiltInVoice[];
};
type Provider = "SARVAM" | "ELEVENLABS";
const PROVIDER_META: Record<Provider, { label: string; color: string; bg: string; border: string; dot: string; activeBg: string; activeText: string }> = {
  SARVAM: {
    label: "Sarvam",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    dot: "bg-violet-500",
    activeBg: "bg-violet-100",
    activeText: "text-violet-700",
  },
  ELEVENLABS: {
    label: "ElevenLabs",
    color: "text-gray-900",
    bg: "bg-white",
    border: "border-slate-300",
    dot: "bg-gray-900",
    activeBg: "bg-gray-900",
    activeText: "text-white",
  },
};
export default function SuperAdminVoicesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Provider>("ELEVENLABS");
  const [showSarvamPicker, setShowSarvamPicker] = useState(false);
  const [selectedSarvamIds, setSelectedSarvamIds] = useState<string[]>([]);
  const [registry, setRegistry] = useState<VoiceRegistry | null>(null);
  const [form, setForm] = useState({ provider: "ELEVENLABS" as Provider, id: "" });
  // Preview state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const loadRegistry = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/voices", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load voices");
      setRegistry(await res.json());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load voices");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadRegistry(); }, []);
  const stopPreview = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPlayingVoiceId(null);
  };
  const playSample = async (voice: BuiltInVoice) => {
    if (playingVoiceId === voice.id) { stopPreview(); return; }
    setPreviewLoading(true);
    try {
      stopPreview();
      const endpoint = voice.provider === "SARVAM"
        ? "/api/admin/voice/preview/sarvam"
        : "/api/admin/voice/preview";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, transcript: "Hello, how are you doing? I'm ready to conduct the interview.", orgId: null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Preview failed");
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      previewUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;
      setPlayingVoiceId(voice.id);
      audio.play();
      audio.onended = () => { stopPreview(); };
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
      setPlayingVoiceId(null);
    } finally {
      setPreviewLoading(false);
    }
  };
  const builtInMatch = useMemo(() => {
    const id = form.id.trim();
    if (!id || !registry) return null;
    return registry.builtInVoices.find((v) => v.id === id) ?? null;
  }, [form.id, registry]);
  const byProvider = useMemo(() => {
    if (!registry) return { SARVAM: [], ELEVENLABS: [] } as Record<Provider, BuiltInVoice[]>;
    const term = search.trim().toLowerCase();
    const voices = term
      ? registry.selectableVoices.filter((v) =>
          [v.id, v.name, v.description, v.provider, v.model].join(" ").toLowerCase().includes(term)
        )
      : registry.selectableVoices;
    return {
      SARVAM: voices.filter((v) => v.provider === "SARVAM"),
      ELEVENLABS: voices.filter((v) => v.provider === "ELEVENLABS"),
    } as Record<Provider, BuiltInVoice[]>;
  }, [registry, search]);
  const missingSarvam = useMemo(
    () => registry?.builtInVoices.filter((v) => v.provider === "SARVAM" && !v.isSelectable) ?? [],
    [registry]
  );
  const isCustom = (id: string) =>
    Boolean(registry?.customVoices.some((r) => r.id === id && !r.isBuiltIn));
  const submitAction = async (action: "add" | "remove" | "delete", payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Request failed");
      toast.success(
        action === "add" ? "Voice added to engine" :
        action === "remove" ? "Voice removed from engine" :
        "Voice permanently deleted"
      );
      await loadRegistry();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };
  const onAdd = async () => {
    const id = form.id.trim();
    if (!id) { toast.error("Voice ID is required"); return; }
    await submitAction("add", { id, provider: form.provider });
    setForm((p) => ({ ...p, id: "" }));
  };
  const addSarvam = async () => {
    if (!selectedSarvamIds.length) { toast.error("Select at least one voice"); return; }
    setSaving(true);
    try {
      for (const id of selectedSarvamIds) {
        const res = await fetch("/api/super-admin/voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", provider: "SARVAM", id }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `Failed to add ${id}`);
      }
      toast.success(`${selectedSarvamIds.length} Sarvam voice(s) added`);
      setSelectedSarvamIds([]);
      setShowSarvamPicker(false);
      await loadRegistry();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add voices");
    } finally {
      setSaving(false);
    }
  };
  const totalActive = registry?.selectableVoices.length ?? 0;
  if (loading && !registry) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
          <p className="text-sm font-medium text-gray-500">Loading voice registry…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Voice Engine</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage TTS voices across Sarvam and ElevenLabs</p>
        </div>
        {/* Quick stats — always visible in header */}
        <div className="flex items-center gap-2">
          {(["SARVAM", "ELEVENLABS"] as Provider[]).map((p) => {
            const meta = PROVIDER_META[p];
            const count = byProvider[p].length;
            return (
              <div key={p} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5", meta.bg, meta.border)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                <span className={cn("text-[11px] font-bold", meta.color)}>{meta.label}</span>
                <span className={cn("text-[11px] font-extrabold tabular-nums", meta.color)}>{count}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-violet-50 px-2.5 py-1.5">
            <Zap className="h-3 w-3 text-violet-500" />
            <span className="text-[11px] font-bold text-gray-600">Total</span>
            <span className="text-[11px] font-extrabold tabular-nums text-gray-900">{totalActive}</span>
          </div>
        </div>
      </div>
      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ── Left: Add Voice panel ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Panel header */}
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100">
              <Plus className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Add Voice</p>
              <p className="text-[11px] font-medium text-gray-400">Register a new voice to the engine</p>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {/* Provider selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Provider</label>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-gray-200 bg-violet-50 p-0.5">
                {(["SARVAM", "ELEVENLABS"] as Provider[]).map((p) => {
                  const meta = PROVIDER_META[p];
                  const active = form.provider === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setForm({ provider: p, id: "" });
                        setSelectedSarvamIds([]);
                        setShowSarvamPicker(false);
                      }}
                      className={cn(
                        "rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                        active
                          ? cn("shadow-sm", meta.activeBg, meta.activeText)
                          : "text-gray-400 hover:text-gray-600"
                      )}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Voice ID or Sarvam picker */}
            {form.provider !== "SARVAM" ? (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Voice ID</label>
                <input
                  value={form.id}
                  onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
                  placeholder="Paste ElevenLabs voice ID…"
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Available Sarvam Voices
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSarvamPicker((p) => !p)}
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none transition hover:border-violet-300 focus:border-violet-400"
                  >
                    <span className={selectedSarvamIds.length ? "font-semibold text-gray-900" : "text-gray-400"}>
                      {selectedSarvamIds.length > 0
                        ? `${selectedSarvamIds.length} voice${selectedSarvamIds.length > 1 ? "s" : ""} selected`
                        : missingSarvam.length === 0
                          ? "All voices already active"
                          : `${missingSarvam.length} voice${missingSarvam.length > 1 ? "s" : ""} available`}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", showSarvamPicker && "rotate-180")} />
                  </button>
                  {showSarvamPicker && (
                    <div className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                      {missingSarvam.length === 0 ? (
                        <p className="px-4 py-3 text-xs font-medium text-gray-500">
                          All Sarvam voices are already in the engine.
                        </p>
                      ) : (
                        <div className="p-1.5 space-y-0.5">
                          {missingSarvam.map((voice) => {
                            const checked = selectedSarvamIds.includes(voice.id);
                            return (
                              <label
                                key={voice.id}
                                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-violet-50"
                              >
                                <div className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition",
                                  checked ? "border-violet-500 bg-violet-500" : "border-slate-300"
                                )}>
                                  {checked && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedSarvamIds((prev) =>
                                      checked ? prev.filter((id) => id !== voice.id) : [...prev, voice.id]
                                    )
                                  }
                                  className="sr-only"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-gray-900">{voice.name}</p>
                                  <p className="truncate text-[11px] font-mono text-gray-400">{voice.id}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Built-in match hint — only shown when there IS a match */}
            {form.provider !== "SARVAM" && form.id.trim() && builtInMatch && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                <p className="text-xs font-semibold text-emerald-800">Matched: {builtInMatch.name}</p>
                <p className="mt-0.5 text-[11px] text-emerald-600">{builtInMatch.model} · {builtInMatch.provider}</p>
              </div>
            )}
            {/* Add button */}
            <button
              type="button"
              disabled={saving || (form.provider === "SARVAM" ? selectedSarvamIds.length === 0 : !form.id.trim())}
              onClick={form.provider === "SARVAM" ? addSarvam : onAdd}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-blue-400 text-xs font-bold text-white shadow-sm shadow-orange-200 transition hover:from-orange-600 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {form.provider === "SARVAM"
                ? selectedSarvamIds.length > 0
                  ? `Add ${selectedSarvamIds.length} Voice${selectedSarvamIds.length > 1 ? "s" : ""}`
                  : "Select Voices to Add"
                : "Add to Engine"}
            </button>
          </div>
        </div>
        {/* ── Right: Active Registry ── */}
        <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden" style={{ maxHeight: "calc(100vh - 180px)" }}>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100">
                <Mic2 className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">Active Registry</p>
                <p className="text-[11px] font-medium text-gray-400">All voices selectable by organizations</p>
              </div>
            </div>
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search voices…"
                className="h-8 w-full rounded-lg border border-gray-200 bg-violet-50 pl-8 pr-3 text-xs font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
          {/* Provider tabs */}
          <div className="flex shrink-0 border-b border-gray-100 px-4">
            {(["SARVAM", "ELEVENLABS"] as Provider[]).map((p) => {
              const meta = PROVIDER_META[p];
              const count = byProvider[p].length;
              const active = activeTab === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActiveTab(p)}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-violet-500 text-violet-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full transition", active ? meta.dot : "bg-slate-300")} />
                  {meta.label}
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition",
                    active ? cn(meta.bg, meta.border, "border", meta.color) : "bg-gray-100 text-gray-400"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Voice list — scrollable */}
          <div className="flex-1 overflow-y-auto p-3">
            {byProvider[activeTab].length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl mb-2", PROVIDER_META[activeTab].bg)}>
                  <AudioWaveform className={cn("h-4 w-4", PROVIDER_META[activeTab].color)} />
                </div>
                <p className="text-xs font-semibold text-gray-700">
                  {search ? "No voices match your search" : `No ${PROVIDER_META[activeTab].label} voices active`}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-400">
                  {search ? "Try a different search term" : "Add a voice using the panel on the left"}
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {byProvider[activeTab].map((voice) => {
                  const meta = PROVIDER_META[activeTab];
                  const custom = isCustom(voice.id);
                  const isPlaying = playingVoiceId === voice.id;
                  const isLoadingThis = previewLoading && isPlaying;
                  return (
                    <div
                      key={voice.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition hover:border-slate-300 hover:shadow-sm"
                    >
                      {/* Voice info */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", meta.bg)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-gray-900">{voice.name}</p>
                            {custom && (
                              <span className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600">
                                Custom
                              </span>
                            )}
                            {voice.gender && (
                              <span className="shrink-0 rounded border border-gray-200 bg-violet-50 px-1 py-0.5 text-[9px] font-semibold capitalize text-gray-500">
                                {voice.gender}
                              </span>
                            )}
                          </div>
                          <p className="truncate font-mono text-[10px] text-gray-400">{voice.id}</p>
                        </div>
                      </div>
                      {/* Action buttons — always visible */}
                      <div className="flex shrink-0 items-center gap-1">
                        {/* Preview */}
                        <button
                          type="button"
                          onClick={() => playSample(voice)}
                          disabled={previewLoading && !isPlaying}
                          title={isPlaying ? "Stop preview" : "Preview voice"}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md border transition",
                            isPlaying
                              ? "border-violet-300 bg-violet-50 text-violet-600 hover:bg-violet-100"
                              : "border-gray-200 bg-white text-gray-500 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600",
                            previewLoading && !isPlaying && "cursor-not-allowed opacity-40"
                          )}
                        >
                          {isLoadingThis ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isPlaying ? (
                            <Pause className="h-3 w-3 fill-current" />
                          ) : (
                            <Play className="h-3 w-3 fill-current ml-0.5" />
                          )}
                        </button>
                        {/* Remove */}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => submitAction("remove", { id: voice.id })}
                          title="Remove from engine"
                          className="flex h-6 items-center rounded-md border border-gray-200 bg-white px-2 text-[10px] font-bold text-gray-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                        >
                          Remove
                        </button>
                        {/* Delete (custom only) */}
                        {custom && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => submitAction("delete", { id: voice.id })}
                            title="Permanently delete"
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
